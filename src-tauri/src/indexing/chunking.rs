use std::sync::OnceLock;

use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use tiktoken_rs::{cl100k_base, CoreBPE};

// Default to a conservative chunk size until we can detect the embedding model's
// context window dynamically.
const MAX_TOKENS_PER_CHUNK_V2: usize = 512;

/// Dispatch to the correct chunker for the requested version.
pub(crate) fn chunk_document(contents: &str, chunking_version: i64) -> Vec<String> {
    match chunking_version {
        2 => chunk_markdown_v2(contents),
        _ => chunk_markdown_v2(contents),
    }
}

pub(crate) fn hash_content(contents: &str) -> String {
    blake3::hash(contents.as_bytes()).to_hex().to_string()
}

/// Chunk Markdown by major headings and enforce a token ceiling per chunk.
fn chunk_markdown_v2(contents: &str) -> Vec<String> {
    let sections = split_major_sections(contents);
    let mut chunks = Vec::new();

    for section in sections {
        let section = section.trim();
        if section.is_empty() {
            continue;
        }

        if count_tokens(section) <= MAX_TOKENS_PER_CHUNK_V2 {
            chunks.push(section.to_string());
        } else {
            chunks.extend(split_section_by_tokens(section, MAX_TOKENS_PER_CHUNK_V2));
        }
    }

    if chunks.is_empty() && !contents.trim().is_empty() {
        if count_tokens(contents) <= MAX_TOKENS_PER_CHUNK_V2 {
            chunks.push(contents.trim().to_string());
        } else {
            chunks.extend(split_section_by_tokens(contents, MAX_TOKENS_PER_CHUNK_V2));
        }
    }

    chunks
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
    let mut table_block_start: Option<usize> = None;

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
            Event::Start(Tag::Table(_)) => {
                push_section(contents, current_start, range.start, &mut sections);
                table_block_start = Some(range.start);
            }
            Event::End(TagEnd::Table) => {
                if let Some(start) = table_block_start.take() {
                    push_section(contents, start, range.end, &mut sections);
                    current_start = range.end;
                }
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
    matches!(level, HeadingLevel::H1 | HeadingLevel::H2 | HeadingLevel::H3)
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

        loop {
            if start >= end {
                break;
            }

            match tokenizer.decode(tokens[start..end].to_vec()) {
                Ok(decoded) => {
                    let trimmed = decoded.trim().to_string();
                    if !trimmed.is_empty() {
                        chunks.push(trimmed);
                    }
                    break;
                }
                Err(error) => {
                    if end >= tokens.len() {
                        println!(
                            "[split_section_by_tokens] Failed to decode final chunk starting at token {}: {:?}",
                            start,
                            error
                        );
                        break;
                    }

                    end += 1;
                }
            }
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

fn count_tokens(text: &str) -> usize {
    tokenizer().encode_ordinary(text).len()
}

fn tokenizer() -> &'static CoreBPE {
    static TOKENIZER: OnceLock<CoreBPE> = OnceLock::new();
    TOKENIZER.get_or_init(|| cl100k_base().expect("failed to initialize cl100k tokenizer"))
}

#[cfg(test)]
mod tests;
