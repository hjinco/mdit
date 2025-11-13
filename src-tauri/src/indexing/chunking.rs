use std::sync::OnceLock;

use tiktoken_rs::{cl100k_base, CoreBPE};

// Default to a conservative chunk size until we can detect the embedding model's
// context window dynamically.
const MAX_TOKENS_PER_CHUNK_V1: usize = 512;

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

    chunks
}

fn split_major_sections(contents: &str) -> Vec<String> {
    let mut sections = Vec::new();
    let mut current = String::new();

    for line in contents.lines() {
        let is_heading = is_major_heading_line(line);
        if is_heading {
            if !current.trim().is_empty() {
                sections.push(current.trim().to_string());
            }
            current.clear();
        }

        if !current.is_empty() {
            current.push('\n');
        }
        current.push_str(line);
    }

    if !current.trim().is_empty() {
        sections.push(current.trim().to_string());
    }

    if sections.is_empty() && !contents.trim().is_empty() {
        sections.push(contents.trim().to_string());
    }

    sections
}

fn is_major_heading_line(line: &str) -> bool {
    let trimmed = line.trim_start();
    if !trimmed.starts_with('#') {
        return false;
    }

    let hashes = trimmed.chars().take_while(|c| *c == '#').count();
    if hashes == 0 || hashes > 2 {
        return false;
    }

    match trimmed.chars().nth(hashes) {
        Some(ch) if ch.is_whitespace() => true,
        None => true,
        _ => false,
    }
}

fn split_section_by_tokens(section: &str, max_tokens: usize) -> Vec<String> {
    if section.trim().is_empty() || max_tokens == 0 {
        return Vec::new();
    }

    let tokenizer = tokenizer();
    let tokens = tokenizer.encode_ordinary(section);
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

fn count_tokens(text: &str) -> usize {
    tokenizer().encode_ordinary(text).len()
}

fn tokenizer() -> &'static CoreBPE {
    static TOKENIZER: OnceLock<CoreBPE> = OnceLock::new();
    TOKENIZER.get_or_init(|| cl100k_base().expect("failed to initialize cl100k tokenizer"))
}
