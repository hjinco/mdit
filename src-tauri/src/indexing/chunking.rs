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

#[derive(Clone, Copy)]
struct FenceState {
    fence_char: char,
    fence_len: usize,
}

fn split_major_sections(contents: &str) -> Vec<String> {
    let mut sections = Vec::new();
    let mut current = String::new();
    let mut fence_state: Option<FenceState> = None;

    for line in contents.lines() {
        if let Some(state) = fence_state {
            if is_fence_closing_line(line, state) {
                fence_state = None;
            }
        } else if let Some(state) = detect_fence_line(line) {
            fence_state = Some(state);
        }

        let is_heading = is_major_heading_line(line);
        let is_hr = fence_state.is_none() && is_horizontal_rule_line(line);
        if is_heading || is_hr {
            if !current.trim().is_empty() {
                sections.push(current.trim().to_string());
            }
            current.clear();
        }

        if is_hr {
            continue;
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

fn is_horizontal_rule_line(line: &str) -> bool {
    let mut chars = line.chars().filter(|c| !c.is_whitespace());
    let first = match chars.next() {
        Some(ch) if ch == '-' || ch == '*' || ch == '_' => ch,
        _ => return false,
    };

    let mut count = 1;
    for ch in chars {
        if ch != first {
            return false;
        }
        count += 1;
    }

    count >= 3
}

fn detect_fence_line(line: &str) -> Option<FenceState> {
    fence_delimiter_info(line).map(|(fence_char, fence_len, _)| FenceState {
        fence_char,
        fence_len,
    })
}

fn is_fence_closing_line(line: &str, fence: FenceState) -> bool {
    match fence_delimiter_info(line) {
        Some((ch, len, rest)) => {
            ch == fence.fence_char && len >= fence.fence_len && rest.trim().is_empty()
        }
        None => false,
    }
}

fn fence_delimiter_info(line: &str) -> Option<(char, usize, &str)> {
    let trimmed = line.trim_start();
    let bytes = trimmed.as_bytes();
    if bytes.len() < 3 {
        return None;
    }

    let first = bytes[0];
    if first != b'`' && first != b'~' {
        return None;
    }

    let mut len = 1;
    while len < bytes.len() && bytes[len] == first {
        len += 1;
    }

    if len < 3 {
        return None;
    }

    Some((first as char, len, &trimmed[len..]))
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
