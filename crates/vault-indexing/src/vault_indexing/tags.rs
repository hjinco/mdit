use std::collections::HashSet;

use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use serde_yaml::{Mapping, Value};

const BOM: char = '\u{FEFF}';
const ZERO_WIDTH_SPACE: char = '\u{200B}';

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct NoteTag {
    pub(crate) tag: String,
    pub(crate) normalized_tag: String,
}

pub(crate) fn extract_note_tags(source: &str) -> Vec<NoteTag> {
    if source.trim().is_empty() {
        return Vec::new();
    }

    let cleaned = strip_hidden_chars(source);
    let (frontmatter, body) = split_frontmatter(&cleaned);

    let mut seen = HashSet::new();
    let mut tags = Vec::new();

    if let Some(frontmatter) = frontmatter {
        collect_frontmatter_tags(frontmatter, &mut seen, &mut tags);
    }
    collect_inline_tags(body, &mut seen, &mut tags);

    tags
}

pub(crate) fn normalize_tag_query(raw: &str) -> Option<String> {
    normalize_tag_value(raw).map(|(_, normalized)| normalized)
}

fn strip_hidden_chars(raw: &str) -> String {
    raw.chars()
        .filter(|ch| *ch != BOM && *ch != ZERO_WIDTH_SPACE)
        .collect()
}

fn split_frontmatter(raw: &str) -> (Option<&str>, &str) {
    let trimmed = raw.trim_start();
    if !trimmed.starts_with("---") {
        return (None, raw);
    }

    let Some(rest_index) = frontmatter_rest_index(trimmed) else {
        return (None, raw);
    };

    let leading_ws_len = raw.len() - trimmed.len();
    let frontmatter_end = leading_ws_len + rest_index;
    let frontmatter = &raw[leading_ws_len..frontmatter_end];
    let body = &raw[frontmatter_end..];

    (Some(frontmatter), body)
}

fn frontmatter_rest_index(input: &str) -> Option<usize> {
    let bytes = input.as_bytes();
    let mut line_start = 0usize;
    let mut i = 0usize;
    let mut line_no = 0usize;
    let mut has_yaml_hint = false;

    loop {
        if i == bytes.len() || bytes[i] == b'\n' {
            let line = &input[line_start..i];
            let line_trimmed = line.trim_end_matches('\r');
            if line_no == 0 {
                if !is_frontmatter_delimiter(line_trimmed) {
                    return None;
                }
            } else {
                if line_trimmed.contains(':') || line_trimmed.trim_start().starts_with("- ") {
                    has_yaml_hint = true;
                }
                if is_frontmatter_delimiter(line_trimmed) && (has_yaml_hint || line_no == 1) {
                    let rest_start = if i < bytes.len() { i + 1 } else { i };
                    return Some(rest_start);
                }
            }

            line_no += 1;
            if i == bytes.len() {
                break;
            }
            line_start = i + 1;
        }
        i += 1;
    }

    None
}

fn is_frontmatter_delimiter(line: &str) -> bool {
    line.trim() == "---"
}

fn collect_frontmatter_tags(
    frontmatter: &str,
    seen: &mut HashSet<String>,
    output: &mut Vec<NoteTag>,
) {
    let payload = frontmatter_payload(frontmatter);
    let Ok(value) = serde_yaml::from_str::<Value>(&payload) else {
        return;
    };

    let Some(tags_value) = lookup_mapping_value(&value, "tags") else {
        return;
    };

    match tags_value {
        Value::String(value) => push_tag(value, seen, output),
        Value::Sequence(items) => {
            for item in items {
                if let Value::String(value) = item {
                    push_tag(value, seen, output);
                }
            }
        }
        _ => {}
    }
}

fn frontmatter_payload(frontmatter: &str) -> String {
    let lines: Vec<&str> = frontmatter.lines().collect();
    if lines.len() >= 2 && lines[0].trim() == "---" {
        let last = lines.len() - 1;
        if lines[last].trim() == "---" {
            return lines[1..last].join("\n");
        }
    }

    frontmatter.to_string()
}

fn lookup_mapping_value<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let Value::Mapping(map) = value else {
        return None;
    };

    lookup_mapping_case_insensitive(map, key)
}

fn lookup_mapping_case_insensitive<'a>(map: &'a Mapping, key: &str) -> Option<&'a Value> {
    map.iter().find_map(|(map_key, value)| {
        let Value::String(name) = map_key else {
            return None;
        };
        if name.eq_ignore_ascii_case(key) {
            Some(value)
        } else {
            None
        }
    })
}

fn collect_inline_tags(body: &str, seen: &mut HashSet<String>, output: &mut Vec<NoteTag>) {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(body, options);
    let mut skip_depth = 0usize;

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::CodeBlock(_) | Tag::Link { .. } | Tag::Image { .. } => {
                    skip_depth = skip_depth.saturating_add(1);
                }
                _ => {}
            },
            Event::End(tag_end) => match tag_end {
                TagEnd::CodeBlock | TagEnd::Link | TagEnd::Image => {
                    skip_depth = skip_depth.saturating_sub(1);
                }
                _ => {}
            },
            Event::Text(text) if skip_depth == 0 => {
                collect_inline_tags_from_text(&text, seen, output);
            }
            Event::Code(_) => {}
            Event::Html(_) | Event::InlineHtml(_) => {}
            _ => {}
        }
    }
}

fn collect_inline_tags_from_text(
    text: &str,
    seen: &mut HashSet<String>,
    output: &mut Vec<NoteTag>,
) {
    let mut search_index = 0usize;

    while search_index < text.len() {
        let Some(relative_hash) = text[search_index..].find('#') else {
            break;
        };
        let hash_index = search_index + relative_hash;
        let prev = text[..hash_index].chars().next_back();

        if is_tag_boundary(prev) {
            let tag_start = hash_index + '#'.len_utf8();
            if let Some((tag_end, raw_tag)) = parse_inline_tag(text, tag_start) {
                push_tag(raw_tag, seen, output);
                search_index = tag_end;
                continue;
            }
        }

        search_index = hash_index + '#'.len_utf8();
    }
}

fn is_tag_boundary(prev: Option<char>) -> bool {
    match prev {
        None => true,
        Some(ch) => !is_tag_char(ch) && ch != '/' && ch != '#',
    }
}

fn parse_inline_tag(text: &str, start: usize) -> Option<(usize, &str)> {
    let mut end = start;
    let mut has_any_segment = false;
    let mut segment_len = 0usize;

    for (offset, ch) in text[start..].char_indices() {
        let absolute = start + offset;
        if is_tag_char(ch) {
            segment_len += 1;
            has_any_segment = true;
            end = absolute + ch.len_utf8();
            continue;
        }

        if ch == '/' {
            if segment_len == 0 {
                return None;
            }
            segment_len = 0;
            end = absolute + ch.len_utf8();
            continue;
        }

        break;
    }

    if !has_any_segment || segment_len == 0 {
        return None;
    }

    Some((end, &text[start..end]))
}

fn push_tag(raw: &str, seen: &mut HashSet<String>, output: &mut Vec<NoteTag>) {
    let Some((tag, normalized_tag)) = normalize_tag_value(raw) else {
        return;
    };

    if seen.insert(normalized_tag.clone()) {
        output.push(NoteTag {
            tag,
            normalized_tag,
        });
    }
}

fn normalize_tag_value(raw: &str) -> Option<(String, String)> {
    let trimmed = raw.trim();
    let trimmed = trimmed.strip_prefix('#').unwrap_or(trimmed).trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut tag = String::new();
    let mut normalized = String::new();
    let mut segment_len = 0usize;

    for ch in trimmed.chars() {
        if is_tag_char(ch) {
            tag.push(ch);
            normalized.extend(ch.to_lowercase());
            segment_len += 1;
            continue;
        }

        if ch == '/' {
            if segment_len == 0 {
                return None;
            }
            tag.push(ch);
            normalized.push(ch);
            segment_len = 0;
            continue;
        }

        return None;
    }

    if segment_len == 0 || tag.is_empty() {
        return None;
    }

    Some((tag, normalized))
}

fn is_tag_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_' || ch == '-'
}

#[cfg(test)]
mod tests {
    use super::{extract_note_tags, normalize_tag_query};

    #[test]
    fn extracts_inline_and_frontmatter_tags_case_insensitively() {
        let raw = [
            "---",
            "tags:",
            "  - Project",
            "  - '#Project/Alpha'",
            "---",
            "Body #project and #Project/Beta",
        ]
        .join("\n");

        let tags = extract_note_tags(&raw);

        assert_eq!(
            tags.into_iter()
                .map(|tag| (tag.tag, tag.normalized_tag))
                .collect::<Vec<_>>(),
            vec![
                ("Project".to_string(), "project".to_string()),
                ("Project/Alpha".to_string(), "project/alpha".to_string()),
                ("Project/Beta".to_string(), "project/beta".to_string()),
            ]
        );
    }

    #[test]
    fn ignores_false_boundaries_code_links_and_urls() {
        let raw = [
            "# Heading",
            "C# is not a tag and neither is https://example.com/#anchor.",
            "`#code` [#link](https://example.com) ![#alt](image.png)",
            "Keep #valid and (#nested/tag).",
        ]
        .join("\n");

        let tags = extract_note_tags(&raw);

        assert_eq!(
            tags.into_iter()
                .map(|tag| tag.normalized_tag)
                .collect::<Vec<_>>(),
            vec!["valid".to_string(), "nested/tag".to_string()]
        );
    }

    #[test]
    fn ignores_invalid_or_truncated_tags() {
        let raw = "Skip #, #/, #tag/, and #tag//child but keep #done";

        let tags = extract_note_tags(raw);

        assert_eq!(
            tags.into_iter()
                .map(|tag| tag.normalized_tag)
                .collect::<Vec<_>>(),
            vec!["done".to_string()]
        );
    }

    #[test]
    fn normalizes_queries_with_optional_hash_prefix() {
        assert_eq!(
            normalize_tag_query("#Project/Alpha"),
            Some("project/alpha".to_string())
        );
        assert_eq!(normalize_tag_query("Project"), Some("project".to_string()));
        assert_eq!(normalize_tag_query("#project/"), None);
        assert_eq!(normalize_tag_query(""), None);
    }
}
