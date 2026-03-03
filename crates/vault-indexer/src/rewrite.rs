use std::{
    collections::{HashMap, HashSet},
    path::{Component, Path, PathBuf},
};

use pathdiff::diff_paths;
use pulldown_cmark::{Event, Parser, Tag, TagEnd};
use regex::Regex;

fn inline_link_regex() -> Regex {
    Regex::new(r#"!?\[[^\]\n]*\]\((?P<target>(?:\\.|[^)\n])*)\)"#)
        .expect("inline markdown regex should compile")
}

fn wiki_link_regex() -> Regex {
    Regex::new(r#"!?\[\[(?P<target>[^\[\]\n]+)\]\]"#).expect("wiki markdown regex should compile")
}

fn definition_link_regex() -> Regex {
    Regex::new(r#"(?m)^\s*\[[^\]\n]+\]:\s*(?P<target>[^\n]+)$"#)
        .expect("reference definition regex should compile")
}

pub fn normalize_slashes(value: &str) -> String {
    value.replace('\\', "/")
}

fn strip_markdown_extension(value: &str) -> String {
    let normalized = normalize_slashes(value);
    let lower = normalized.to_ascii_lowercase();

    if lower.ends_with(".mdx") {
        return normalized[..normalized.len().saturating_sub(4)].to_string();
    }

    if lower.ends_with(".md") {
        return normalized[..normalized.len().saturating_sub(3)].to_string();
    }

    normalized
}

pub fn split_wiki_target_suffix(value: &str) -> (&str, &str) {
    if let Some(index) = value.find('#') {
        (&value[..index], &value[index..])
    } else {
        (value, "")
    }
}

fn split_wiki_target_alias(value: &str) -> (&str, &str) {
    if let Some(index) = value.find('|') {
        (&value[..index], &value[index..])
    } else {
        (value, "")
    }
}

pub fn with_preserved_surrounding_whitespace(original: &str, replacement: &str) -> String {
    let leading = original
        .chars()
        .take_while(|ch| ch.is_whitespace())
        .collect::<String>();
    let trailing = original
        .chars()
        .rev()
        .take_while(|ch| ch.is_whitespace())
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();

    format!("{leading}{replacement}{trailing}")
}

fn normalize_wiki_query_path(value: &str) -> String {
    let mut normalized = normalize_slashes(value.trim());

    while normalized.starts_with("./") {
        normalized = normalized[2..].to_string();
    }

    while normalized.starts_with('/') {
        normalized = normalized[1..].to_string();
    }

    strip_markdown_extension(&normalized)
}

fn path_suffix_matches(path: &str, suffix: &str) -> bool {
    if path == suffix {
        return true;
    }

    if !path.ends_with(suffix) || path.len() <= suffix.len() {
        return false;
    }

    path.as_bytes()
        .get(path.len().saturating_sub(suffix.len() + 1))
        .is_some_and(|ch| *ch == b'/')
}

pub fn is_external_wiki_target(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.starts_with('#') || trimmed.starts_with("//") {
        return true;
    }

    if let Some(index) = trimmed.find(':') {
        let scheme = &trimmed[..index];
        if !scheme.is_empty()
            && scheme
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '+' || ch == '.' || ch == '-')
        {
            return true;
        }
    }

    false
}

pub fn does_wiki_target_refer_to_rel_path(raw_target: &str, rel_path: &str) -> bool {
    let trimmed = raw_target.trim();
    if trimmed.is_empty() || is_external_wiki_target(trimmed) {
        return false;
    }

    let (path, _) = split_wiki_target_suffix(trimmed);
    let normalized_query = normalize_wiki_query_path(path);
    if normalized_query.is_empty() {
        return false;
    }

    let rel_no_ext = strip_markdown_extension(&normalize_slashes(rel_path)).to_lowercase();
    let query_no_ext = normalized_query.to_lowercase();
    path_suffix_matches(&rel_no_ext, &query_no_ext)
}

pub fn to_wiki_target_from_abs_path(workspace_path: &Path, note_path: &Path) -> String {
    let rel = note_path
        .strip_prefix(workspace_path)
        .unwrap_or(note_path)
        .to_string_lossy();

    strip_markdown_extension(&normalize_slashes(&rel))
}

fn normalize_for_comparison(path: &Path) -> String {
    let mut segments: Vec<String> = Vec::new();
    let mut prefix = String::new();
    let mut has_root = false;

    for component in path.components() {
        match component {
            Component::Prefix(value) => {
                prefix = normalize_slashes(&value.as_os_str().to_string_lossy());
            }
            Component::RootDir => {
                has_root = true;
            }
            Component::CurDir => {}
            Component::ParentDir => {
                segments.pop();
            }
            Component::Normal(segment) => {
                segments.push(segment.to_string_lossy().to_string());
            }
        }
    }

    let mut normalized = String::new();
    if !prefix.is_empty() {
        normalized.push_str(&prefix);
        if has_root && !normalized.ends_with('/') {
            normalized.push('/');
        }
    } else if has_root {
        normalized.push('/');
    }

    if !segments.is_empty() {
        if !normalized.is_empty() && !normalized.ends_with('/') {
            normalized.push('/');
        }
        normalized.push_str(&segments.join("/"));
    }

    if normalized.is_empty() {
        normalized = ".".to_string();
    }

    #[cfg(windows)]
    {
        return normalized.to_lowercase();
    }

    #[cfg(not(windows))]
    {
        normalized
    }
}

fn is_external_markdown_target(target: &str) -> bool {
    let trimmed = target.trim();
    if trimmed.starts_with('#') || trimmed.starts_with('/') || trimmed.starts_with("//") {
        return true;
    }

    if trimmed.len() >= 3 {
        let bytes = trimmed.as_bytes();
        if bytes[1] == b':' && (bytes[2] == b'/' || bytes[2] == b'\\') {
            return true;
        }
    }

    if let Some(index) = trimmed.find(':') {
        let scheme = &trimmed[..index];
        if !scheme.is_empty()
            && scheme
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '+' || ch == '.' || ch == '-')
        {
            return true;
        }
    }

    false
}

fn split_whitespace_wrapped(input: &str) -> (&str, &str, &str) {
    let start = input
        .char_indices()
        .find(|(_, ch)| !ch.is_whitespace())
        .map(|(index, _)| index)
        .unwrap_or(input.len());

    if start == input.len() {
        return (input, "", "");
    }

    let end_exclusive = input
        .char_indices()
        .rev()
        .find(|(_, ch)| !ch.is_whitespace())
        .map(|(index, ch)| index + ch.len_utf8())
        .unwrap_or(start);

    (
        &input[..start],
        &input[start..end_exclusive],
        &input[end_exclusive..],
    )
}

fn split_markdown_target_and_title(input: &str) -> (&str, &str) {
    if input.starts_with('<') {
        let mut escaped = false;
        for (index, ch) in input.char_indices().skip(1) {
            if escaped {
                escaped = false;
                continue;
            }

            if ch == '\\' {
                escaped = true;
                continue;
            }

            if ch == '>' {
                return (&input[..=index], &input[index + 1..]);
            }
        }
    }

    let mut escaped = false;
    for (index, ch) in input.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }

        if ch == '\\' {
            escaped = true;
            continue;
        }

        if ch.is_whitespace() {
            return (&input[..index], &input[index..]);
        }
    }

    (input, "")
}

fn split_markdown_path_suffix(input: &str) -> (&str, &str) {
    let hash_index = input.find('#');
    let query_index = input.find('?');

    let split_index = match (hash_index, query_index) {
        (Some(hash), Some(query)) => Some(hash.min(query)),
        (Some(hash), None) => Some(hash),
        (None, Some(query)) => Some(query),
        (None, None) => None,
    };

    if let Some(index) = split_index {
        (&input[..index], &input[index..])
    } else {
        (input, "")
    }
}

fn is_escapable_markdown_char(ch: char) -> bool {
    matches!(
        ch,
        '(' | ')'
            | '['
            | ']'
            | '{'
            | '}'
            | '<'
            | '>'
            | '"'
            | '\''
            | ' '
            | '\t'
            | '\n'
            | '\r'
            | '\\'
    )
}

fn decode_markdown_destination(destination: &str) -> String {
    let mut decoded = String::with_capacity(destination.len());
    let mut chars = destination.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\\'
            && chars
                .peek()
                .is_some_and(|next| is_escapable_markdown_char(*next))
        {
            if let Some(next) = chars.next() {
                decoded.push(next);
                continue;
            }
        }

        decoded.push(ch);
    }

    decoded
}

fn should_use_backslash_separator(path: &str) -> bool {
    path.contains('\\') && !path.contains('/')
}

fn escape_markdown_destination(destination: &str) -> String {
    let mut escaped = String::with_capacity(destination.len());
    for ch in destination.chars() {
        if matches!(ch, '(' | ')' | '<' | '>' | ' ' | '\t' | '\n' | '\r') {
            escaped.push('\\');
        }
        escaped.push(ch);
    }
    escaped
}

fn protected_ranges(content: &str) -> Vec<(usize, usize)> {
    let mut ranges: Vec<(usize, usize)> = Vec::new();
    let mut code_block_start: Option<usize> = None;

    for (event, range) in Parser::new(content).into_offset_iter() {
        match event {
            Event::Code(_) => ranges.push((range.start, range.end)),
            Event::Start(Tag::CodeBlock(_)) => {
                code_block_start = Some(range.start);
            }
            Event::End(TagEnd::CodeBlock) => {
                if let Some(start) = code_block_start.take() {
                    ranges.push((start, range.end));
                }
            }
            _ => {}
        }
    }

    ranges.sort_by(|a, b| a.0.cmp(&b.0));
    ranges
}

fn overlaps_protected(start: usize, end: usize, ranges: &[(usize, usize)]) -> bool {
    ranges
        .iter()
        .any(|(protected_start, protected_end)| start < *protected_end && end > *protected_start)
}

fn apply_replacements(content: &str, mut replacements: Vec<(usize, usize, String)>) -> String {
    if replacements.is_empty() {
        return content.to_string();
    }

    replacements.sort_by(|a, b| a.0.cmp(&b.0));

    let mut result = String::with_capacity(content.len());
    let mut cursor = 0usize;

    for (start, end, replacement) in replacements {
        if start < cursor {
            continue;
        }

        result.push_str(&content[cursor..start]);
        result.push_str(&replacement);
        cursor = end;
    }

    result.push_str(&content[cursor..]);
    result
}

fn rewrite_markdown_target_for_rename(
    raw_target: &str,
    source_dir: &Path,
    old_target_path: &Path,
    new_target_path: &Path,
) -> Option<String> {
    let (leading_ws, middle, trailing_ws) = split_whitespace_wrapped(raw_target);
    if middle.is_empty() {
        return None;
    }

    let (path_with_suffix, title_suffix) = split_markdown_target_and_title(middle);
    if path_with_suffix.is_empty() || is_external_markdown_target(path_with_suffix) {
        return None;
    }

    let (path_part, path_suffix) = split_markdown_path_suffix(path_with_suffix);
    if path_part.is_empty() {
        return None;
    }

    let uses_angle_brackets =
        path_part.starts_with('<') && path_part.ends_with('>') && path_part.len() >= 2;
    let plain_path = if uses_angle_brackets {
        &path_part[1..path_part.len() - 1]
    } else {
        path_part
    };

    if plain_path.is_empty() {
        return None;
    }

    let resolved_path = source_dir.join(decode_markdown_destination(plain_path));
    if normalize_for_comparison(&resolved_path) != normalize_for_comparison(old_target_path) {
        return None;
    }

    let relative =
        diff_paths(new_target_path, source_dir).unwrap_or_else(|| PathBuf::from(new_target_path));
    let mut rendered = normalize_slashes(&relative.to_string_lossy());

    if should_use_backslash_separator(plain_path) {
        rendered = rendered.replace('/', "\\");
    }

    if uses_angle_brackets {
        rendered = format!("<{rendered}>");
    } else {
        rendered = escape_markdown_destination(&rendered);
    }

    Some(format!(
        "{leading_ws}{rendered}{path_suffix}{title_suffix}{trailing_ws}"
    ))
}

pub fn rewrite_markdown_links_for_renamed_target(
    content: &str,
    source_dir: &Path,
    old_target_path: &Path,
    new_target_path: &Path,
) -> String {
    if content.is_empty() {
        return content.to_string();
    }

    let protected = protected_ranges(content);
    let inline_pattern = inline_link_regex();
    let definition_pattern = definition_link_regex();
    let mut replacements: Vec<(usize, usize, String)> = Vec::new();

    for captures in inline_pattern.captures_iter(content) {
        let Some(target_match) = captures.name("target") else {
            continue;
        };

        if overlaps_protected(target_match.start(), target_match.end(), &protected) {
            continue;
        }

        let replacement = rewrite_markdown_target_for_rename(
            target_match.as_str(),
            source_dir,
            old_target_path,
            new_target_path,
        );

        if let Some(replacement) = replacement {
            if replacement != target_match.as_str() {
                replacements.push((target_match.start(), target_match.end(), replacement));
            }
        }
    }

    for captures in definition_pattern.captures_iter(content) {
        let Some(target_match) = captures.name("target") else {
            continue;
        };

        if overlaps_protected(target_match.start(), target_match.end(), &protected) {
            continue;
        }

        let replacement = rewrite_markdown_target_for_rename(
            target_match.as_str(),
            source_dir,
            old_target_path,
            new_target_path,
        );

        if let Some(replacement) = replacement {
            if replacement != target_match.as_str() {
                replacements.push((target_match.start(), target_match.end(), replacement));
            }
        }
    }

    apply_replacements(content, replacements)
}

pub fn collect_wiki_link_targets(content: &str) -> Vec<String> {
    if content.is_empty() {
        return Vec::new();
    }

    let protected = protected_ranges(content);
    let pattern = wiki_link_regex();
    let mut unique = HashSet::new();
    let mut targets = Vec::new();

    for captures in pattern.captures_iter(content) {
        let Some(target_match) = captures.name("target") else {
            continue;
        };

        if overlaps_protected(target_match.start(), target_match.end(), &protected) {
            continue;
        }

        let (value, _) = split_wiki_target_alias(target_match.as_str());
        let value = value.to_string();
        if unique.insert(value.clone()) {
            targets.push(value);
        }
    }

    targets
}

pub fn rewrite_wiki_link_targets(content: &str, replacements: &HashMap<String, String>) -> String {
    if content.is_empty() || replacements.is_empty() {
        return content.to_string();
    }

    let protected = protected_ranges(content);
    let pattern = wiki_link_regex();
    let mut updates: Vec<(usize, usize, String)> = Vec::new();

    for captures in pattern.captures_iter(content) {
        let Some(target_match) = captures.name("target") else {
            continue;
        };

        if overlaps_protected(target_match.start(), target_match.end(), &protected) {
            continue;
        }

        let (target, alias_suffix) = split_wiki_target_alias(target_match.as_str());
        let Some(replacement) = replacements.get(target) else {
            continue;
        };

        let replacement_text = format!("{replacement}{alias_suffix}");
        if replacement_text == target_match.as_str() {
            continue;
        }

        updates.push((target_match.start(), target_match.end(), replacement_text));
    }

    apply_replacements(content, updates)
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, path::Path};

    use super::{
        collect_wiki_link_targets, rewrite_markdown_links_for_renamed_target,
        rewrite_wiki_link_targets,
    };

    #[test]
    fn rewrite_markdown_links_for_renamed_target_updates_matching_links() {
        let content = "[A](./old.md)\n[B](../shared/old.md#head)\n[C](./other.md)";
        let rewritten = rewrite_markdown_links_for_renamed_target(
            content,
            Path::new("/repo/docs/current"),
            Path::new("/repo/docs/current/old.md"),
            Path::new("/repo/docs/renamed/new.md"),
        );

        assert_eq!(
            rewritten,
            "[A](../renamed/new.md)\n[B](../shared/old.md#head)\n[C](./other.md)"
        );
    }

    #[test]
    fn rewrite_markdown_links_for_renamed_target_updates_reference_definitions() {
        let content = "[guide]: ./old.md#intro \"Guide\"";
        let rewritten = rewrite_markdown_links_for_renamed_target(
            content,
            Path::new("/repo/docs/current"),
            Path::new("/repo/docs/current/old.md"),
            Path::new("/repo/docs/renamed/new.md"),
        );

        assert_eq!(rewritten, "[guide]: ../renamed/new.md#intro \"Guide\"");
    }

    #[test]
    fn rewrite_markdown_links_for_renamed_target_updates_query_and_anchor_suffixes() {
        let content = "[guide](./old.md?view=full#intro)";
        let rewritten = rewrite_markdown_links_for_renamed_target(
            content,
            Path::new("/repo/docs/current"),
            Path::new("/repo/docs/current/old.md"),
            Path::new("/repo/docs/renamed/new.md"),
        );

        assert_eq!(rewritten, "[guide](../renamed/new.md?view=full#intro)");
    }

    #[test]
    fn rewrite_markdown_links_for_renamed_target_updates_escaped_parentheses_paths() {
        let content = r#"[guide](./old\(final\).md)"#;
        let rewritten = rewrite_markdown_links_for_renamed_target(
            content,
            Path::new("/repo/docs/current"),
            Path::new("/repo/docs/current/old(final).md"),
            Path::new("/repo/docs/renamed/new.md"),
        );

        assert_eq!(rewritten, "[guide](../renamed/new.md)");
    }

    #[test]
    fn rewrite_markdown_links_for_renamed_target_updates_angle_bracket_paths_with_spaces() {
        let content = "[guide](<./old note.md>)";
        let rewritten = rewrite_markdown_links_for_renamed_target(
            content,
            Path::new("/repo/docs/current"),
            Path::new("/repo/docs/current/old note.md"),
            Path::new("/repo/docs/renamed/new note.md"),
        );

        assert_eq!(rewritten, "[guide](<../renamed/new note.md>)");
    }

    #[test]
    fn rewrite_markdown_links_for_renamed_target_escapes_plain_paths_with_spaces_and_parentheses() {
        let content = "[guide](./old.md)";
        let rewritten = rewrite_markdown_links_for_renamed_target(
            content,
            Path::new("/repo/docs/current"),
            Path::new("/repo/docs/current/old.md"),
            Path::new("/repo/docs/renamed/new note (v2).md"),
        );

        assert_eq!(rewritten, r"[guide](../renamed/new\ note\ \(v2\).md)");
    }

    #[test]
    fn collect_wiki_link_targets_ignores_inline_and_fenced_code() {
        let content = [
            "[[docs/old-note|Alias]]",
            "`[[inline-code]]`",
            "```md",
            "[[inside-fence]]",
            "```",
            "![[docs/old-note#section]]",
        ]
        .join("\n");

        let targets = collect_wiki_link_targets(&content);
        assert_eq!(targets, vec!["docs/old-note", "docs/old-note#section"]);
    }

    #[test]
    fn rewrite_wiki_link_targets_rewrites_only_mapped_entries() {
        let content = [
            "[[docs/old-note|Alias]]",
            "![[docs/old-note#section]]",
            "`[[docs/old-note]]`",
            "[[other-note]]",
        ]
        .join("\n");
        let mut replacements = HashMap::new();
        replacements.insert("docs/old-note".to_string(), "archive/new-note".to_string());
        replacements.insert(
            "docs/old-note#section".to_string(),
            "archive/new-note#section".to_string(),
        );

        let rewritten = rewrite_wiki_link_targets(&content, &replacements);
        assert_eq!(
            rewritten,
            [
                "[[archive/new-note|Alias]]",
                "![[archive/new-note#section]]",
                "`[[docs/old-note]]`",
                "[[other-note]]",
            ]
            .join("\n")
        );
    }
}
