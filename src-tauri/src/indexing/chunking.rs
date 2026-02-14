use std::sync::OnceLock;

use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use tiktoken_rs::{cl100k_base, CoreBPE};

// Default to a conservative chunk size until we can detect the embedding model's
// context window dynamically.
const MAX_TOKENS_PER_CHUNK_V1: usize = 1024;
// Enforce a floor to avoid generating noisy embeddings with ultra-short chunks.
const MIN_TOKENS_PER_CHUNK_V1: usize = 128;

/// Dispatch to the correct chunker for the requested version.
pub(crate) fn chunk_document(contents: &str, chunking_version: i64) -> Vec<String> {
    match chunking_version {
        1 => chunk_markdown_v1(contents),
        _ => chunk_markdown_v1(contents),
    }
}

pub(crate) fn hash_content(contents: &str) -> String {
    blake3::hash(contents.as_bytes()).to_hex().to_string()
}

/// Chunk Markdown by major headings and enforce a token ceiling per chunk.
fn chunk_markdown_v1(contents: &str) -> Vec<String> {
    let sections = split_major_sections(contents);
    let mut chunks = Vec::new();

    for section in sections {
        let section = section.trim();
        if section.is_empty() {
            continue;
        }

        if count_tokens(section) <= MAX_TOKENS_PER_CHUNK_V1 {
            chunks.push(section.to_string());
        } else {
            chunks.extend(split_section_by_tokens(section, MAX_TOKENS_PER_CHUNK_V1));
        }
    }

    if chunks.is_empty() && !contents.trim().is_empty() {
        if count_tokens(contents) <= MAX_TOKENS_PER_CHUNK_V1 {
            chunks.push(contents.trim().to_string());
        } else {
            chunks.extend(split_section_by_tokens(contents, MAX_TOKENS_PER_CHUNK_V1));
        }
    }

    enforce_min_chunk_tokens(chunks, MIN_TOKENS_PER_CHUNK_V1, MAX_TOKENS_PER_CHUNK_V1)
}

fn split_major_sections(contents: &str) -> Vec<String> {
    let trimmed = contents.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_YAML_STYLE_METADATA_BLOCKS);

    let parser = Parser::new_ext(contents, options).into_offset_iter();
    let mut sections = Vec::new();
    let mut current_start = 0usize;
    let mut in_code_block = false;
    let mut code_block_start: Option<usize> = None;

    for (event, range) in parser {
        match event {
            Event::Start(Tag::CodeBlock(_)) => {
                push_section(contents, current_start, range.start, &mut sections);
                code_block_start = Some(range.start);
                in_code_block = true;
            }
            Event::End(TagEnd::CodeBlock) => {
                if let Some(start) = code_block_start.take() {
                    push_section(contents, start, range.end, &mut sections);
                    current_start = range.end;
                }
                in_code_block = false;
            }
            Event::Start(Tag::Heading { level, .. }) if is_major_heading(level) => {
                push_section(contents, current_start, range.start, &mut sections);
                current_start = range.start;
            }
            Event::Rule if !in_code_block => {
                push_section(contents, current_start, range.start, &mut sections);
                current_start = range.end;
            }
            _ => {}
        }
    }

    if current_start < contents.len() {
        push_section(contents, current_start, contents.len(), &mut sections);
    }

    if sections.is_empty() && !trimmed.is_empty() {
        sections.push(trimmed.to_string());
    }

    sections
}

fn push_section(contents: &str, start: usize, end: usize, sections: &mut Vec<String>) {
    if start >= end || end > contents.len() {
        return;
    }

    let slice = contents[start..end].trim();
    if !slice.is_empty() {
        sections.push(slice.to_string());
    }
}

fn is_major_heading(level: HeadingLevel) -> bool {
    matches!(level, HeadingLevel::H1 | HeadingLevel::H2)
}

fn split_section_by_tokens(section: &str, max_tokens: usize) -> Vec<String> {
    if section.trim().is_empty() || max_tokens == 0 {
        return Vec::new();
    }

    let paragraphs = split_paragraphs(section);
    let mut chunks = Vec::new();
    let mut current_chunk = String::new();

    for paragraph in paragraphs {
        if count_tokens(&paragraph) > max_tokens {
            if !current_chunk.trim().is_empty() {
                chunks.push(current_chunk.trim().to_string());
                current_chunk.clear();
            }
            chunks.extend(split_text_strict_by_tokens(&paragraph, max_tokens));
            continue;
        }

        if current_chunk.is_empty() {
            current_chunk = paragraph;
            continue;
        }

        let candidate = format!("{}\n\n{}", current_chunk, paragraph);
        if count_tokens(&candidate) <= max_tokens {
            current_chunk = candidate;
        } else {
            chunks.push(current_chunk.trim().to_string());
            current_chunk = paragraph;
        }
    }

    if !current_chunk.trim().is_empty() {
        chunks.push(current_chunk.trim().to_string());
    }

    if chunks.is_empty() {
        split_text_strict_by_tokens(section, max_tokens)
    } else {
        chunks
    }
}

fn split_text_strict_by_tokens(text: &str, max_tokens: usize) -> Vec<String> {
    if text.trim().is_empty() || max_tokens == 0 {
        return Vec::new();
    }

    let tokenizer = tokenizer();
    let tokens = tokenizer.encode_ordinary(text);
    if tokens.is_empty() {
        return Vec::new();
    }

    let mut chunks = Vec::new();
    let mut start = 0;

    while start < tokens.len() {
        let mut end = usize::min(start + max_tokens, tokens.len());
        let mut decoded_chunk: Option<String> = None;

        while end <= tokens.len() {
            match tokenizer.decode(tokens[start..end].to_vec()) {
                Ok(decoded) => {
                    decoded_chunk = Some(decoded);
                    break;
                }
                Err(_) if end < tokens.len() => {
                    // Extend until we hit a valid UTF-8 boundary.
                    end += 1;
                }
                Err(_) => break,
            }
        }

        let Some(decoded) = decoded_chunk else {
            break;
        };

        let trimmed = decoded.trim().to_string();
        if !trimmed.is_empty() {
            chunks.push(trimmed);
        }

        start = end;
    }

    chunks
}

fn split_paragraphs(section: &str) -> Vec<String> {
    if is_atomic_block(section) {
        return vec![section.to_string()];
    }

    let mut paragraphs = Vec::new();
    let mut current = String::new();

    for line in section.lines() {
        if line.trim().is_empty() {
            if !current.is_empty() {
                let paragraph = current.trim_end().to_string();
                if !paragraph.is_empty() {
                    paragraphs.push(paragraph);
                }
                current.clear();
            }
        } else {
            if !current.is_empty() {
                current.push('\n');
            }
            current.push_str(line);
        }
    }

    if !current.is_empty() {
        let paragraph = current.trim_end().to_string();
        if !paragraph.is_empty() {
            paragraphs.push(paragraph);
        }
    }

    if paragraphs.is_empty() {
        vec![section.to_string()]
    } else {
        paragraphs
    }
}

fn is_atomic_block(section: &str) -> bool {
    looks_like_code_block(section) || looks_like_table(section)
}

fn looks_like_code_block(section: &str) -> bool {
    let trimmed = section.trim_start();
    trimmed.starts_with("```") || trimmed.starts_with("~~~")
}

fn looks_like_table(section: &str) -> bool {
    let trimmed = section.trim();
    if trimmed.is_empty() {
        return false;
    }

    let mut non_empty_lines = trimmed
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty());

    let header = match non_empty_lines.next() {
        Some(line) => line,
        None => return false,
    };

    let separator = match non_empty_lines.next() {
        Some(line) => line,
        None => return false,
    };

    header.contains('|') && is_table_separator_line(separator)
}

fn is_table_separator_line(line: &str) -> bool {
    if !line.contains('|') {
        return false;
    }

    let mut has_dash = false;
    for ch in line.chars() {
        match ch {
            '|' | ' ' => {}
            '-' => has_dash = true,
            ':' => {}
            _ => return false,
        }
    }

    has_dash
}

fn enforce_min_chunk_tokens(
    mut chunks: Vec<String>,
    min_tokens: usize,
    max_tokens: usize,
) -> Vec<String> {
    if chunks.len() < 2 || min_tokens == 0 {
        return chunks;
    }

    let mut index = 0;
    while index < chunks.len() {
        if count_tokens(&chunks[index]) >= min_tokens {
            index += 1;
            continue;
        }

        if chunks.len() == 1 {
            break;
        }

        let mut merged_any = false;

        while count_tokens(&chunks[index]) < min_tokens && chunks.len() > 1 {
            let previous_candidate = if index > 0 {
                let merged = merge_chunk_pair(&chunks[index - 1], &chunks[index]);
                let token_count = count_tokens(&merged);
                if token_count <= max_tokens {
                    Some((MergeDirection::Previous, token_count, merged))
                } else {
                    None
                }
            } else {
                None
            };

            let next_candidate = if index + 1 < chunks.len() {
                let merged = merge_chunk_pair(&chunks[index], &chunks[index + 1]);
                let token_count = count_tokens(&merged);
                if token_count <= max_tokens {
                    Some((MergeDirection::Next, token_count, merged))
                } else {
                    None
                }
            } else {
                None
            };

            let selected = match (previous_candidate, next_candidate) {
                (Some(prev), Some(next)) => {
                    if prev.1 >= next.1 {
                        Some(prev)
                    } else {
                        Some(next)
                    }
                }
                (Some(prev), None) => Some(prev),
                (None, Some(next)) => Some(next),
                (None, None) => None,
            };

            let Some((direction, _token_count, merged)) = selected else {
                break;
            };

            match direction {
                MergeDirection::Previous => {
                    let previous_index = index - 1;
                    chunks[previous_index] = merged;
                    chunks.remove(index);
                    index = previous_index;
                }
                MergeDirection::Next => {
                    let next_index = index + 1;
                    chunks[index] = merged;
                    chunks.remove(next_index);
                }
            }

            merged_any = true;
        }

        if !merged_any {
            index += 1;
            continue;
        }

        index += 1;
    }

    chunks.retain(|chunk| !chunk.trim().is_empty());
    chunks
}

#[derive(Copy, Clone, PartialEq, Eq)]
enum MergeDirection {
    Previous,
    Next,
}

fn merge_chunk_pair(left: &str, right: &str) -> String {
    if left.trim().is_empty() {
        return right.to_string();
    }

    if right.trim().is_empty() {
        return left.to_string();
    }

    format!("{left}\n\n{right}")
}

fn count_tokens(text: &str) -> usize {
    tokenizer().encode_ordinary(text).len()
}

fn tokenizer() -> &'static CoreBPE {
    static TOKENIZER: OnceLock<CoreBPE> = OnceLock::new();
    TOKENIZER.get_or_init(|| cl100k_base().expect("failed to initialize cl100k tokenizer"))
}

#[cfg(test)]
mod unit_tests {
    use super::{
        count_tokens, enforce_min_chunk_tokens, split_major_sections, split_section_by_tokens,
        split_text_strict_by_tokens,
    };

    const GFM_MARKDOWN: &str = r#"---
title: Sample Doc
tags:
  - demo
---

# Overview
Welcome to **Mdit**.

## TODOs
- [ ] Outline pulldown flow
- [x] Wire chunk tests

---

# Data
| Column | Type |
| ------ | ---- |
| id | number |
| title | text |

```rust
fn main() {
    println!("hello gfm");
}
```
"#;

    const RULE_IN_CODE_BLOCK: &str = r#"# Section

```
---
```

## After
Still content here
"#;

    #[test]
    fn splits_gfm_sections_with_headings_and_tables() {
        let chunks = split_major_sections(GFM_MARKDOWN);
        let expected = vec![
            "---\ntitle: Sample Doc\ntags:\n  - demo\n---",
            "# Overview\nWelcome to **Mdit**.",
            "## TODOs\n- [ ] Outline pulldown flow\n- [x] Wire chunk tests",
            "# Data\n| Column | Type |\n| ------ | ---- |\n| id | number |\n| title | text |",
            "```rust\nfn main() {\n    println!(\"hello gfm\");\n}\n```",
        ]
        .into_iter()
        .map(|section| section.to_string())
        .collect::<Vec<_>>();

        assert_eq!(chunks, expected);
    }

    #[test]
    fn code_blocks_split_into_separate_sections_and_ignore_rules() {
        let chunks = split_major_sections(RULE_IN_CODE_BLOCK);
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0], "# Section");
        assert!(
            chunks[1].contains("```"),
            "code block section should contain fenced code block"
        );
        assert!(
            chunks[1].contains("---"),
            "code block section should keep literal dashes inside code block"
        );
        assert_eq!(chunks[2], "## After\nStill content here");
    }

    #[test]
    fn keeps_h3_headings_in_same_major_section() {
        let markdown = r#"# Title

Intro

### Details
More data here

### Extra
Closing thoughts
"#;

        let chunks = split_major_sections(markdown);
        assert_eq!(chunks.len(), 1);
        assert_eq!(
            chunks[0],
            "# Title\n\nIntro\n\n### Details\nMore data here\n\n### Extra\nClosing thoughts"
        );
    }

    #[test]
    fn splits_long_sections_by_paragraph_before_tokens() {
        let section = "alpha beta gamma delta\n\nepsilon zeta eta theta\n\niota kappa lambda mu";
        let chunks = split_section_by_tokens(section, 7);

        assert_eq!(chunks.len(), 3, "paragraph boundaries should be respected");
        assert_eq!(chunks[0], "alpha beta gamma delta");
        assert_eq!(chunks[1], "epsilon zeta eta theta");
        assert_eq!(chunks[2], "iota kappa lambda mu");
    }

    #[test]
    fn falls_back_to_token_split_for_single_large_paragraph() {
        let section = "Rep".repeat(60);
        let chunks = split_section_by_tokens(&section, 10);

        assert!(
            chunks.len() > 1,
            "single oversized paragraph should be token split"
        );
    }

    #[test]
    fn token_split_preserves_utf8_without_replacement_chars() {
        let section = "한글🙂테스트".repeat(120);
        let chunks = split_text_strict_by_tokens(&section, 11);

        assert!(chunks.len() > 1, "text should be split into multiple chunks");
        assert!(
            chunks.iter().all(|chunk| !chunk.contains('\u{FFFD}')),
            "chunks must not contain UTF-8 replacement characters"
        );
        assert_eq!(chunks.join(""), section);
    }

    #[test]
    fn keeps_tables_together_even_with_blank_lines() {
        let section = "| Column | Type |\n| ------ | ---- |\n\n| id | number |\n| title | text |";
        let chunks = split_section_by_tokens(section, 200);

        assert_eq!(chunks.len(), 1, "tables should remain atomic");
        assert!(chunks[0].contains("| Column | Type |"));
        assert!(chunks[0].contains("| title | text |"));
    }

    #[test]
    fn merges_short_chunk_with_both_neighbors_when_needed() {
        let left = "# Intro\nContext that leads the document.";
        let short = "Short note";
        let right =
            "## Details\nThis paragraph adds enough body to satisfy the minimum requirements.";

        let min_tokens = count_tokens(&format!("{left}\n\n{short}")) + 1;
        let merged = enforce_min_chunk_tokens(
            vec![left.to_string(), short.to_string(), right.to_string()],
            min_tokens,
            10_000,
        );

        assert_eq!(
            merged.len(),
            1,
            "short chunk should be absorbed by neighbors"
        );
        let combined = &merged[0];
        assert!(combined.contains("Intro"));
        assert!(combined.contains("Short note"));
        assert!(combined.contains("Details"));
    }

    #[test]
    fn merges_short_chunk_forward_when_only_next_neighbors_exist() {
        let first = "Tiny";
        let middle = "Still not enough";
        let tail =
            "Adding this chunk should push us past the threshold so the first entry can stand.";
        let trailing = "Final chunk that should remain unchanged";

        let min_tokens = count_tokens(&format!("{first}\n\n{middle}")) + 1;
        let merged = enforce_min_chunk_tokens(
            vec![
                first.to_string(),
                middle.to_string(),
                tail.to_string(),
                trailing.to_string(),
            ],
            min_tokens,
            10_000,
        );

        assert_eq!(
            merged.len(),
            2,
            "first three chunks should collapse into a single entry"
        );
        assert!(merged[0].contains(first));
        assert!(merged[0].contains(middle));
        assert!(merged[0].contains(tail));
        assert_eq!(merged[1], trailing);
    }

    #[test]
    fn merges_short_chunk_backward_when_at_tail() {
        let intro = "Opening context that can absorb more text.";
        let middle = "Second chunk that is still too small after one merge.";
        let short = "tiny";

        let min_tokens = count_tokens(&format!("{middle}\n\n{short}")) + 1;
        let merged = enforce_min_chunk_tokens(
            vec![intro.to_string(), middle.to_string(), short.to_string()],
            min_tokens,
            10_000,
        );

        assert_eq!(
            merged.len(),
            1,
            "tail chunk should merge backward twice when needed"
        );
        let combined = &merged[0];
        assert!(combined.contains(intro));
        assert!(combined.contains(middle));
        assert!(combined.contains(short));
    }

    #[test]
    fn keeps_short_chunk_when_all_merges_would_exceed_max_tokens() {
        let left = "alpha ".repeat(180);
        let short = "tiny";
        let right = "beta ".repeat(180);

        let min_tokens = count_tokens(short) + 1;
        let max_tokens = count_tokens(left.trim());
        let chunks = enforce_min_chunk_tokens(
            vec![left.clone(), short.to_string(), right.clone()],
            min_tokens,
            max_tokens,
        );

        assert_eq!(
            chunks.len(),
            3,
            "short chunk should remain if no legal merge exists"
        );
        assert_eq!(chunks[1], short);
    }
}
