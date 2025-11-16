use std::sync::OnceLock;

use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use tiktoken_rs::{cl100k_base, CoreBPE};

// Default to a conservative chunk size until we can detect the embedding model's
// context window dynamically.
const MAX_TOKENS_PER_CHUNK_V2: usize = 512;
// Enforce a floor to avoid generating noisy embeddings with ultra-short chunks.
const MIN_TOKENS_PER_CHUNK_V2: usize = 64;

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

    enforce_min_chunk_tokens(chunks, MIN_TOKENS_PER_CHUNK_V2)
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
                    let table_slice = &contents[start..range.end];
                    let table_rows = split_table_rows(table_slice);
                    if table_rows.is_empty() {
                        push_section(contents, start, range.end, &mut sections);
                    } else {
                        sections.extend(table_rows);
                    }
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
    matches!(
        level,
        HeadingLevel::H1 | HeadingLevel::H2 | HeadingLevel::H3
    )
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

fn split_table_rows(table_markdown: &str) -> Vec<String> {
    let lines: Vec<&str> = table_markdown
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect();

    if lines.len() < 2 {
        return Vec::new();
    }

    let header_line = lines[0];
    let separator_line = lines[1];
    if !is_table_separator_line(separator_line) {
        return Vec::new();
    }

    let header_cells = parse_table_cells(header_line);
    if header_cells.is_empty() {
        return Vec::new();
    }

    let headers: Vec<String> = header_cells
        .into_iter()
        .enumerate()
        .map(|(index, header)| {
            let trimmed = header.trim();
            if trimmed.is_empty() {
                format!("Column {}", index + 1)
            } else {
                trimmed.to_string()
            }
        })
        .collect();

    let mut rows = Vec::new();
    for row_line in lines.iter().skip(2).copied() {
        if is_table_separator_line(row_line) {
            continue;
        }

        let cells = parse_table_cells(row_line);
        if cells.is_empty() {
            continue;
        }

        let mut normalized = Vec::new();
        for (index, header) in headers.iter().enumerate() {
            let value = cells.get(index).map(|value| value.trim()).unwrap_or("");
            if value.is_empty() {
                continue;
            }
            normalized.push(format!("{}: {}", header, value));
        }

        for extra_index in headers.len()..cells.len() {
            let value = cells[extra_index].trim();
            if value.is_empty() {
                continue;
            }
            normalized.push(format!("Column {}: {}", extra_index + 1, value));
        }

        if !normalized.is_empty() {
            rows.push(normalized.join(" | "));
        }
    }

    rows
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

fn parse_table_cells(line: &str) -> Vec<String> {
    let trimmed_line = line.trim();
    if trimmed_line.is_empty() {
        return Vec::new();
    }

    let inner = trimmed_line.trim_matches('|');
    let mut cells = Vec::new();
    let mut current = String::new();
    let mut escaped = false;

    for ch in inner.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }

        match ch {
            '\\' => escaped = true,
            '|' => {
                cells.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }

    if escaped {
        current.push('\\');
    }

    cells.push(current.trim().to_string());
    cells
}

fn enforce_min_chunk_tokens(mut chunks: Vec<String>, min_tokens: usize) -> Vec<String> {
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

        let mut attempts = 0;
        let mut last_direction: Option<MergeDirection> = None;
        let mut merged_any = false;

        while attempts < 2 && count_tokens(&chunks[index]) < min_tokens && chunks.len() > 1 {
            let mut merged_this_round = false;

            if attempts == 0 {
                if index > 0 {
                    index = merge_with_previous(&mut chunks, index);
                    last_direction = Some(MergeDirection::Previous);
                    merged_this_round = true;
                } else if index + 1 < chunks.len() {
                    index = merge_with_next(&mut chunks, index);
                    last_direction = Some(MergeDirection::Next);
                    merged_this_round = true;
                }
            } else {
                if last_direction != Some(MergeDirection::Previous) && index > 0 {
                    index = merge_with_previous(&mut chunks, index);
                    last_direction = Some(MergeDirection::Previous);
                    merged_this_round = true;
                } else if last_direction != Some(MergeDirection::Next)
                    && index + 1 < chunks.len()
                {
                    index = merge_with_next(&mut chunks, index);
                    last_direction = Some(MergeDirection::Next);
                    merged_this_round = true;
                } else if index > 0 {
                    index = merge_with_previous(&mut chunks, index);
                    last_direction = Some(MergeDirection::Previous);
                    merged_this_round = true;
                } else if index + 1 < chunks.len() {
                    index = merge_with_next(&mut chunks, index);
                    last_direction = Some(MergeDirection::Next);
                    merged_this_round = true;
                }
            }

            if !merged_this_round {
                break;
            }

            merged_any = true;
            attempts += 1;
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

fn merge_with_previous(chunks: &mut Vec<String>, index: usize) -> usize {
    let prev_index = index - 1;
    let merged = merge_chunk_pair(&chunks[prev_index], &chunks[index]);
    chunks[prev_index] = merged;
    chunks.remove(index);
    prev_index
}

fn merge_with_next(chunks: &mut Vec<String>, index: usize) -> usize {
    let next_index = index + 1;
    let merged = merge_chunk_pair(&chunks[index], &chunks[next_index]);
    chunks[index] = merged;
    chunks.remove(next_index);
    index
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
mod tests;
