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

    pub(crate) fn resolve_links(&self, source: &MarkdownFile, contents: &str) -> Vec<ResolvedLink> {
        let mut candidates = extract_markdown_candidates(contents);
        candidates.extend(extract_wiki_candidates(contents));

        let mut results = Vec::new();
        let mut seen: HashSet<LinkKey> = HashSet::new();

        for candidate in candidates {
            let resolved = match candidate.kind {
                LinkKind::Wiki => self.resolve_wiki_candidate(candidate),
                LinkKind::Markdown => self.resolve_markdown_candidate(source, candidate),
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

    fn resolve_wiki_candidate(&self, candidate: LinkCandidate) -> Option<ResolvedLink> {
        let trimmed = candidate.raw_target.trim();
        if trimmed.is_empty() {
            return None;
        }
        if is_external_target(trimmed) {
            return None;
        }

        let path_part = strip_wiki_anchor(trimmed);

        if path_part.is_empty() {
            return None;
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
                });
            }
        }

        let unresolved = ensure_md_extension(&normalize_wiki_path(path_part));
        Some(ResolvedLink {
            target_doc_id: None,
            target_path: unresolved,
        })
    }

    fn resolve_markdown_candidate(
        &self,
        source: &MarkdownFile,
        candidate: LinkCandidate,
    ) -> Option<ResolvedLink> {
        let trimmed = candidate.raw_target.trim();
        if trimmed.is_empty() {
            return None;
        }

        if is_external_target(trimmed) {
            return None;
        }

        let path_part = strip_markdown_anchor(trimmed);

        if path_part.is_empty() {
            return None;
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
        })
    }
}

#[derive(Hash, PartialEq, Eq)]
struct LinkKey {
    target_path: String,
}

impl From<&ResolvedLink> for LinkKey {
    fn from(link: &ResolvedLink) -> Self {
        Self {
            target_path: link.target_path.clone(),
        }
    }
}

fn extract_markdown_candidates(contents: &str) -> Vec<LinkCandidate> {
    let parser = Parser::new(contents);
    let mut candidates = Vec::new();
    let mut active_dest_url: Option<String> = None;

    for event in parser {
        match event {
            Event::Start(Tag::Link { dest_url, .. }) => {
                active_dest_url = Some(dest_url.to_string());
            }
            Event::End(TagEnd::Link) => {
                if let Some(dest_url) = active_dest_url.take() {
                    if !dest_url.trim().is_empty() {
                        candidates.push(LinkCandidate {
                            kind: LinkKind::Markdown,
                            raw_target: dest_url,
                        });
                    }
                }
            }
            _ => {}
        }
    }

    candidates
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
                if !is_embed {
                    if let Some(raw) = line.get(start..end) {
                        let target = split_wiki_alias(raw);
                        if !target.trim().is_empty() {
                            candidates.push(LinkCandidate {
                                kind: LinkKind::Wiki,
                                raw_target: target.to_string(),
                            });
                        }
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

fn split_wiki_alias(raw: &str) -> &str {
    if let Some((target, _alias)) = raw.split_once('|') {
        target.trim()
    } else {
        raw.trim()
    }
}

fn strip_wiki_anchor(raw: &str) -> &str {
    let hash_index = raw.find('#');
    let block_index = raw.find('^');

    let split_index = match (hash_index, block_index) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    };

    if let Some(index) = split_index {
        raw[..index].trim()
    } else {
        raw.trim()
    }
}

fn strip_markdown_anchor(raw: &str) -> &str {
    if let Some((path, _anchor)) = raw.split_once('#') {
        path.trim()
    } else {
        raw.trim()
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
