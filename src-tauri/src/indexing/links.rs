use std::{
    collections::{HashMap, HashSet},
    path::{Component, Path, PathBuf},
};

use pulldown_cmark::{Event, Parser, Tag, TagEnd};

use super::files::MarkdownFile;

#[derive(Debug, Clone)]
pub(crate) struct ResolvedLink {
    pub(crate) target_doc_id: Option<i64>,
    pub(crate) target_path: String,
    pub(crate) target_anchor: Option<String>,
    pub(crate) alias: Option<String>,
    pub(crate) is_embed: bool,
    pub(crate) is_wiki: bool,
    pub(crate) is_external: bool,
}

#[derive(Debug, Clone, Copy)]
enum LinkKind {
    Wiki,
    Markdown,
}

#[derive(Debug, Clone)]
struct LinkCandidate {
    kind: LinkKind,
    raw_target: String,
    alias: Option<String>,
    is_embed: bool,
}

#[derive(Debug)]
pub(crate) struct LinkResolver {
    workspace_root: PathBuf,
    docs_by_path: HashMap<String, i64>,
    basename_index: HashMap<String, Vec<String>>,
}

impl LinkResolver {
    pub(crate) fn new(workspace_root: &Path, docs_by_path: HashMap<String, i64>) -> Self {
        let mut basename_index: HashMap<String, Vec<String>> = HashMap::new();

        for rel_path in docs_by_path.keys() {
            let stem = Path::new(rel_path)
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .trim();
            if stem.is_empty() {
                continue;
            }

            let key = stem.to_lowercase();
            basename_index
                .entry(key)
                .or_default()
                .push(rel_path.to_string());
        }

        for paths in basename_index.values_mut() {
            paths.sort();
        }

        Self {
            workspace_root: workspace_root.to_path_buf(),
            docs_by_path,
            basename_index,
        }
    }

    pub(crate) fn resolve_links(
        &self,
        source: &MarkdownFile,
        source_doc_id: i64,
        contents: &str,
    ) -> Vec<ResolvedLink> {
        let mut candidates = extract_markdown_candidates(contents);
        candidates.extend(extract_wiki_candidates(contents));

        let mut results = Vec::new();
        let mut seen: HashSet<LinkKey> = HashSet::new();

        for candidate in candidates {
            let resolved = match candidate.kind {
                LinkKind::Wiki => self.resolve_wiki_candidate(source, source_doc_id, candidate),
                LinkKind::Markdown => {
                    self.resolve_markdown_candidate(source, source_doc_id, candidate)
                }
            };

            if let Some(link) = resolved {
                let key = LinkKey::from(&link);
                if seen.insert(key) {
                    results.push(link);
                }
            }
        }

        results
    }

    fn resolve_wiki_candidate(
        &self,
        source: &MarkdownFile,
        source_doc_id: i64,
        candidate: LinkCandidate,
    ) -> Option<ResolvedLink> {
        let trimmed = candidate.raw_target.trim();
        if trimmed.is_empty() {
            return None;
        }
        if is_external_target(trimmed) {
            return None;
        }

        let (path_part, anchor) = split_wiki_target(trimmed);
        let anchor = normalize_anchor(anchor);
        let alias = normalize_alias(candidate.alias);

        if path_part.is_empty() {
            if anchor.is_none() {
                return None;
            }

            return Some(ResolvedLink {
                target_doc_id: Some(source_doc_id),
                target_path: source.rel_path.clone(),
                target_anchor: anchor,
                alias,
                is_embed: candidate.is_embed,
                is_wiki: true,
                is_external: false,
            });
        }

        if path_part.contains('/') || path_part.contains('\\') {
            let normalized = normalize_wiki_path(path_part);
            if normalized.is_empty() {
                return None;
            }
            let normalized = ensure_md_extension(&normalized);
            let target_doc_id = self.docs_by_path.get(&normalized).copied();
            return Some(ResolvedLink {
                target_doc_id,
                target_path: normalized,
                target_anchor: anchor,
                alias,
                is_embed: candidate.is_embed,
                is_wiki: true,
                is_external: false,
            });
        }

        let basename_key = strip_md_extension(path_part).trim().to_lowercase();
        if basename_key.is_empty() {
            return None;
        }

        if let Some(paths) = self.basename_index.get(&basename_key) {
            if let Some(target_path) = paths.first() {
                let target_doc_id = self.docs_by_path.get(target_path).copied();
                return Some(ResolvedLink {
                    target_doc_id,
                    target_path: target_path.clone(),
                    target_anchor: anchor,
                    alias,
                    is_embed: candidate.is_embed,
                    is_wiki: true,
                    is_external: false,
                });
            }
        }

        let unresolved = ensure_md_extension(&normalize_wiki_path(path_part));
        Some(ResolvedLink {
            target_doc_id: None,
            target_path: unresolved,
            target_anchor: anchor,
            alias,
            is_embed: candidate.is_embed,
            is_wiki: true,
            is_external: false,
        })
    }

    fn resolve_markdown_candidate(
        &self,
        source: &MarkdownFile,
        source_doc_id: i64,
        candidate: LinkCandidate,
    ) -> Option<ResolvedLink> {
        let trimmed = candidate.raw_target.trim();
        if trimmed.is_empty() {
            return None;
        }

        if is_external_target(trimmed) {
            return None;
        }

        let (path_part, anchor) = split_anchor(trimmed);
        let anchor = normalize_anchor(anchor);
        let alias = normalize_alias(candidate.alias);

        if path_part.is_empty() {
            if anchor.is_none() {
                return None;
            }

            return Some(ResolvedLink {
                target_doc_id: Some(source_doc_id),
                target_path: source.rel_path.clone(),
                target_anchor: anchor,
                alias,
                is_embed: candidate.is_embed,
                is_wiki: false,
                is_external: false,
            });
        }

        let source_dir = source
            .abs_path
            .parent()
            .unwrap_or_else(|| self.workspace_root.as_path());
        let resolved = resolve_relative_path(source_dir, path_part);

        let rel_path = match resolved.strip_prefix(&self.workspace_root) {
            Ok(rel) => normalize_rel_path(rel),
            Err(_) => return None,
        };
        if rel_path.is_empty() {
            return None;
        }

        let target_doc_id = self.docs_by_path.get(&rel_path).copied();
        Some(ResolvedLink {
            target_doc_id,
            target_path: rel_path,
            target_anchor: anchor,
            alias,
            is_embed: candidate.is_embed,
            is_wiki: false,
            is_external: false,
        })
    }
}

#[derive(Hash, PartialEq, Eq)]
struct LinkKey {
    target_doc_id: Option<i64>,
    target_path: String,
    target_anchor: Option<String>,
    alias: Option<String>,
    is_embed: bool,
    is_wiki: bool,
    is_external: bool,
}

impl From<&ResolvedLink> for LinkKey {
    fn from(link: &ResolvedLink) -> Self {
        Self {
            target_doc_id: link.target_doc_id,
            target_path: link.target_path.clone(),
            target_anchor: link.target_anchor.clone(),
            alias: link.alias.clone(),
            is_embed: link.is_embed,
            is_wiki: link.is_wiki,
            is_external: link.is_external,
        }
    }
}

fn extract_markdown_candidates(contents: &str) -> Vec<LinkCandidate> {
    let parser = Parser::new(contents);
    let mut candidates = Vec::new();
    let mut active: Option<ActiveMarkdownLink> = None;

    for event in parser {
        match event {
            Event::Start(Tag::Link { dest_url, .. }) => {
                active = Some(ActiveMarkdownLink {
                    dest_url: dest_url.to_string(),
                    alias: String::new(),
                    is_embed: false,
                });
            }
            Event::Start(Tag::Image { dest_url, .. }) => {
                active = Some(ActiveMarkdownLink {
                    dest_url: dest_url.to_string(),
                    alias: String::new(),
                    is_embed: true,
                });
            }
            Event::End(TagEnd::Link) | Event::End(TagEnd::Image) => {
                if let Some(link) = active.take() {
                    if !link.dest_url.trim().is_empty() {
                        candidates.push(LinkCandidate {
                            kind: LinkKind::Markdown,
                            raw_target: link.dest_url,
                            alias: normalize_alias(Some(link.alias)),
                            is_embed: link.is_embed,
                        });
                    }
                }
            }
            Event::Text(text) | Event::Code(text) => {
                if let Some(link) = active.as_mut() {
                    link.alias.push_str(&text);
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some(link) = active.as_mut() {
                    if !link.alias.ends_with(' ') {
                        link.alias.push(' ');
                    }
                }
            }
            _ => {}
        }
    }

    candidates
}

struct ActiveMarkdownLink {
    dest_url: String,
    alias: String,
    is_embed: bool,
}

fn extract_wiki_candidates(contents: &str) -> Vec<LinkCandidate> {
    let mut candidates = Vec::new();
    let mut in_fence = false;
    let mut fence_char = '\0';
    let mut fence_len = 0usize;

    for line in contents.lines() {
        let trimmed = line.trim_start();
        if let Some((char, len)) = detect_fence(trimmed) {
            if !in_fence {
                in_fence = true;
                fence_char = char;
                fence_len = len;
            } else if char == fence_char && len >= fence_len {
                in_fence = false;
                fence_char = '\0';
                fence_len = 0;
            }
            continue;
        }

        if in_fence {
            continue;
        }

        extract_wiki_candidates_from_line(line, &mut candidates);
    }

    candidates
}

fn detect_fence(line: &str) -> Option<(char, usize)> {
    let mut chars = line.chars();
    let first = chars.next()?;
    if first != '`' && first != '~' {
        return None;
    }

    let len = line.chars().take_while(|ch| *ch == first).count();
    if len >= 3 {
        Some((first, len))
    } else {
        None
    }
}

fn extract_wiki_candidates_from_line(line: &str, candidates: &mut Vec<LinkCandidate>) {
    let bytes = line.as_bytes();
    let mut i = 0usize;
    let mut in_code = false;
    let mut code_len = 0usize;

    while i < bytes.len() {
        if bytes[i] == b'`' {
            let run = count_run(bytes, i, b'`');
            if !in_code {
                in_code = true;
                code_len = run;
                i += run;
                continue;
            }

            if run >= code_len {
                in_code = false;
                code_len = 0;
                i += run;
                continue;
            }

            i += run;
            continue;
        }

        if in_code {
            i += 1;
            continue;
        }

        if bytes[i] == b'[' && i + 1 < bytes.len() && bytes[i + 1] == b'[' {
            let is_embed = i > 0 && bytes[i - 1] == b'!';
            let start = i + 2;
            if let Some(end) = find_closing_wiki(bytes, start) {
                if let Some(raw) = line.get(start..end) {
                    let (target, alias) = split_wiki_alias(raw);
                    if !target.trim().is_empty() {
                        candidates.push(LinkCandidate {
                            kind: LinkKind::Wiki,
                            raw_target: target.to_string(),
                            alias: alias.map(|value| value.to_string()),
                            is_embed,
                        });
                    }
                }
                i = end + 2;
                continue;
            }
        }

        i += 1;
    }
}

fn count_run(bytes: &[u8], start: usize, needle: u8) -> usize {
    let mut end = start;
    while end < bytes.len() && bytes[end] == needle {
        end += 1;
    }
    end - start
}

fn find_closing_wiki(bytes: &[u8], start: usize) -> Option<usize> {
    let mut i = start;
    while i + 1 < bytes.len() {
        if bytes[i] == b']' && bytes[i + 1] == b']' {
            return Some(i);
        }
        i += 1;
    }
    None
}

fn split_wiki_alias(raw: &str) -> (&str, Option<&str>) {
    if let Some((target, alias)) = raw.split_once('|') {
        (target.trim(), Some(alias.trim()))
    } else {
        (raw.trim(), None)
    }
}

fn split_wiki_target(raw: &str) -> (&str, Option<&str>) {
    let hash_index = raw.find('#');
    let block_index = raw.find('^');

    let split_index = match (hash_index, block_index) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    };

    if let Some(index) = split_index {
        let anchor = raw.get(index + 1..).unwrap_or("");
        return (raw[..index].trim(), Some(anchor.trim()));
    }

    (raw.trim(), None)
}

fn split_anchor(raw: &str) -> (&str, Option<&str>) {
    if let Some((path, anchor)) = raw.split_once('#') {
        (path.trim(), Some(anchor.trim()))
    } else {
        (raw.trim(), None)
    }
}

fn normalize_anchor(anchor: Option<&str>) -> Option<String> {
    let value = anchor.unwrap_or("").trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn normalize_alias(alias: Option<String>) -> Option<String> {
    let Some(value) = alias else {
        return None;
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn normalize_wiki_path(path: &str) -> String {
    let trimmed = path.trim().trim_start_matches(['/', '\\']);
    trimmed.replace('\\', "/")
}

fn ensure_md_extension(path: &str) -> String {
    if has_md_extension(path) {
        path.to_string()
    } else {
        format!("{path}.md")
    }
}

fn strip_md_extension(value: &str) -> &str {
    if has_md_extension(value) {
        value.get(..value.len().saturating_sub(3)).unwrap_or(value)
    } else {
        value
    }
}

fn has_md_extension(value: &str) -> bool {
    value.to_lowercase().ends_with(".md")
}

fn normalize_rel_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn resolve_relative_path(base: &Path, rel: &str) -> PathBuf {
    let mut resolved = PathBuf::from(base);
    let normalized = rel.replace('\\', "/");
    for component in Path::new(&normalized).components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                resolved.pop();
            }
            Component::Normal(value) => resolved.push(value),
            Component::RootDir | Component::Prefix(_) => {
                resolved.push(component.as_os_str());
            }
        }
    }
    resolved
}

fn is_external_target(target: &str) -> bool {
    let trimmed = target.trim();
    if trimmed.starts_with('#') {
        return false;
    }

    if trimmed.starts_with("//") {
        return true;
    }

    if trimmed.starts_with('/') || trimmed.starts_with('\\') {
        return true;
    }

    if has_windows_drive_prefix(trimmed) {
        return true;
    }

    if let Some(index) = trimmed.find(':') {
        let scheme = &trimmed[..index];
        if !scheme.is_empty()
            && scheme
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '+' || ch == '-' || ch == '.')
        {
            return true;
        }
    }

    false
}

fn has_windows_drive_prefix(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(letter) = chars.next() else {
        return false;
    };
    let Some(colon) = chars.next() else {
        return false;
    };
    letter.is_ascii_alphabetic() && colon == ':'
}

#[cfg(test)]
mod tests;
