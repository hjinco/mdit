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

#[derive(Debug, Clone, Default)]
pub(crate) struct LinkResolution {
    pub(crate) links: Vec<ResolvedLink>,
    pub(crate) wiki_query_keys: HashSet<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ResolvedWikiLinkTarget {
    pub(crate) canonical_target: String,
    pub(crate) resolved_rel_path: Option<String>,
    pub(crate) match_count: usize,
    pub(crate) disambiguated: bool,
    pub(crate) unresolved: bool,
}

#[derive(Debug, Clone)]
struct WikiDocEntry {
    rel_path: String,
    rel_path_lower: String,
    no_ext: String,
    no_ext_lower: String,
    dir_lower: String,
    basename_lower: String,
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
    wiki_docs: Vec<WikiDocEntry>,
    basename_index: HashMap<String, Vec<usize>>,
}

impl LinkResolver {
    pub(crate) fn new(workspace_root: &Path, docs_by_path: HashMap<String, i64>) -> Self {
        let (wiki_docs, basename_index) = build_wiki_doc_indexes(docs_by_path.keys());

        Self {
            workspace_root: workspace_root.to_path_buf(),
            docs_by_path,
            wiki_docs,
            basename_index,
        }
    }

    #[allow(dead_code)]
    pub(crate) fn resolve_links(&self, source: &MarkdownFile, contents: &str) -> Vec<ResolvedLink> {
        self.resolve_links_with_dependencies(source, contents).links
    }

    pub(crate) fn resolve_links_with_dependencies(
        &self,
        source: &MarkdownFile,
        contents: &str,
    ) -> LinkResolution {
        let mut candidates = extract_markdown_candidates(contents);
        candidates.extend(extract_wiki_candidates(contents));

        let mut results = Vec::new();
        let mut seen: HashSet<LinkKey> = HashSet::new();
        let mut wiki_query_keys: HashSet<String> = HashSet::new();

        for candidate in candidates {
            if matches!(candidate.kind, LinkKind::Wiki) {
                if let Some(key) = wiki_query_dependency_key(&candidate.raw_target) {
                    wiki_query_keys.insert(key);
                }
            }
            let resolved = match candidate.kind {
                LinkKind::Wiki => self.resolve_wiki_candidate(source, candidate),
                LinkKind::Markdown => self.resolve_markdown_candidate(source, candidate),
            };

            if let Some(link) = resolved {
                let key = LinkKey::from(&link);
                if seen.insert(key) {
                    results.push(link);
                }
            }
        }

        LinkResolution {
            links: results,
            wiki_query_keys,
        }
    }

    fn resolve_wiki_candidate(
        &self,
        source: &MarkdownFile,
        candidate: LinkCandidate,
    ) -> Option<ResolvedLink> {
        let trimmed = candidate.raw_target.trim();
        if trimmed.is_empty() {
            return None;
        }
        if is_external_wiki_target(trimmed) {
            return None;
        }

        let (path_part, _suffix) = split_wiki_target_suffix(trimmed);
        if path_part.is_empty() {
            return None;
        }

        let normalized_query = normalize_wiki_query_path(path_part);
        if normalized_query.is_empty() {
            return None;
        }

        let query_lower = normalized_query.to_lowercase();
        let matches = find_wiki_candidates(
            &self.wiki_docs,
            &self.basename_index,
            &query_lower,
            query_lower.contains('/'),
        );

        if let Some(selected) = choose_preferred_doc(matches, Some(source.rel_path.as_str()), None)
        {
            let target_doc_id = self.docs_by_path.get(&selected.rel_path).copied();
            return Some(ResolvedLink {
                target_doc_id,
                target_path: selected.rel_path.clone(),
            });
        }

        Some(ResolvedLink {
            target_doc_id: None,
            target_path: unresolved_wiki_target_path(&normalized_query, path_part),
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

pub(crate) fn resolve_wiki_link_target(
    workspace_root: &Path,
    current_note_path: Option<&str>,
    raw_target: &str,
    workspace_rel_paths: &[String],
) -> ResolvedWikiLinkTarget {
    let (wiki_docs, basename_index) = build_wiki_doc_indexes(workspace_rel_paths.iter());

    resolve_wiki_target_internal(
        raw_target,
        &wiki_docs,
        &basename_index,
        current_note_path,
        Some(workspace_root),
    )
}

fn resolve_wiki_target_internal(
    raw_target: &str,
    wiki_docs: &[WikiDocEntry],
    basename_index: &HashMap<String, Vec<usize>>,
    current_note_path: Option<&str>,
    workspace_root: Option<&Path>,
) -> ResolvedWikiLinkTarget {
    let trimmed = raw_target.trim();
    if trimmed.is_empty() {
        return unresolved_wiki_target_result(String::new());
    }

    if is_external_wiki_target(trimmed) {
        return unresolved_wiki_target_result(trimmed.to_string());
    }

    let (path_part, suffix) = split_wiki_target_suffix(trimmed);
    let normalized_query = normalize_wiki_query_path(path_part);
    if normalized_query.is_empty() {
        let canonical = if suffix.is_empty() {
            String::new()
        } else {
            suffix.to_string()
        };
        return unresolved_wiki_target_result(canonical);
    }

    let query_lower = normalized_query.to_lowercase();
    let has_separator = query_lower.contains('/');
    let matches = find_wiki_candidates(wiki_docs, basename_index, &query_lower, has_separator);
    let match_count = matches.len();

    let Some(selected) = choose_preferred_doc(matches, current_note_path, workspace_root) else {
        return unresolved_wiki_target_result(append_wiki_suffix(&normalized_query, suffix));
    };

    let canonical_base = shortest_unique_wiki_suffix(selected, wiki_docs);
    ResolvedWikiLinkTarget {
        canonical_target: append_wiki_suffix(&canonical_base, suffix),
        resolved_rel_path: Some(selected.rel_path.clone()),
        match_count,
        disambiguated: match_count > 1,
        unresolved: false,
    }
}

fn unresolved_wiki_target_result(canonical_target: String) -> ResolvedWikiLinkTarget {
    ResolvedWikiLinkTarget {
        canonical_target,
        resolved_rel_path: None,
        match_count: 0,
        disambiguated: false,
        unresolved: true,
    }
}

fn append_wiki_suffix(base: &str, suffix: &str) -> String {
    if suffix.is_empty() {
        return base.to_string();
    }

    if base.is_empty() {
        return suffix.to_string();
    }

    format!("{base}{suffix}")
}

fn build_wiki_doc_indexes<'a, I>(rel_paths: I) -> (Vec<WikiDocEntry>, HashMap<String, Vec<usize>>)
where
    I: Iterator<Item = &'a String>,
{
    let mut wiki_docs = rel_paths
        .filter_map(|rel_path| build_wiki_doc_entry(rel_path.as_str()))
        .collect::<Vec<_>>();
    wiki_docs.sort_by(|a, b| a.rel_path_lower.cmp(&b.rel_path_lower));

    let mut basename_index: HashMap<String, Vec<usize>> = HashMap::new();
    for (index, doc) in wiki_docs.iter().enumerate() {
        basename_index
            .entry(doc.basename_lower.clone())
            .or_default()
            .push(index);
    }

    (wiki_docs, basename_index)
}

fn build_wiki_doc_entry(rel_path: &str) -> Option<WikiDocEntry> {
    let normalized_rel_path = normalize_path_separators(rel_path.trim());
    if normalized_rel_path.is_empty() {
        return None;
    }

    let normalized_rel_path = strip_current_dir_prefix_owned(normalized_rel_path);
    let normalized_rel_path = strip_leading_slashes_owned(normalized_rel_path);
    if normalized_rel_path.is_empty() {
        return None;
    }

    if !has_markdown_extension(&normalized_rel_path) {
        return None;
    }

    let no_ext = strip_markdown_extension(&normalized_rel_path).to_string();
    if no_ext.is_empty() {
        return None;
    }

    let basename_lower = no_ext.rsplit('/').next()?.to_lowercase();
    if basename_lower.is_empty() {
        return None;
    }

    let dir_lower = no_ext
        .rsplit_once('/')
        .map(|(dir, _)| dir.to_lowercase())
        .unwrap_or_default();

    Some(WikiDocEntry {
        rel_path_lower: normalized_rel_path.to_lowercase(),
        no_ext_lower: no_ext.to_lowercase(),
        rel_path: normalized_rel_path,
        no_ext,
        dir_lower,
        basename_lower,
    })
}

fn find_wiki_candidates<'a>(
    wiki_docs: &'a [WikiDocEntry],
    basename_index: &HashMap<String, Vec<usize>>,
    query_lower: &str,
    has_separator: bool,
) -> Vec<&'a WikiDocEntry> {
    if query_lower.is_empty() {
        return Vec::new();
    }

    if has_separator {
        return wiki_docs
            .iter()
            .filter(|doc| path_suffix_matches(&doc.no_ext_lower, query_lower))
            .collect();
    }

    basename_index
        .get(query_lower)
        .map(|indices| {
            indices
                .iter()
                .filter_map(|index| wiki_docs.get(*index))
                .collect()
        })
        .unwrap_or_default()
}

fn choose_preferred_doc<'a>(
    mut candidates: Vec<&'a WikiDocEntry>,
    current_note_path: Option<&str>,
    workspace_root: Option<&Path>,
) -> Option<&'a WikiDocEntry> {
    if candidates.is_empty() {
        return None;
    }

    let current_dir = normalized_current_note_dir_lower(current_note_path, workspace_root);
    candidates.sort_by(|a, b| {
        let a_rank = match current_dir.as_deref() {
            Some(dir) if a.dir_lower == dir => 0,
            _ => 1,
        };
        let b_rank = match current_dir.as_deref() {
            Some(dir) if b.dir_lower == dir => 0,
            _ => 1,
        };

        a_rank
            .cmp(&b_rank)
            .then_with(|| a.rel_path_lower.cmp(&b.rel_path_lower))
    });

    candidates.into_iter().next()
}

fn normalized_current_note_dir_lower(
    current_note_path: Option<&str>,
    workspace_root: Option<&Path>,
) -> Option<String> {
    let current_note_path = current_note_path?.trim();
    if current_note_path.is_empty() {
        return None;
    }

    let path = Path::new(current_note_path);
    let rel_path = if path.is_absolute() {
        let workspace_root = workspace_root?;
        let stripped = path.strip_prefix(workspace_root).ok()?;
        normalize_rel_path(stripped)
    } else {
        normalize_path_separators(current_note_path)
    };

    let rel_path = strip_current_dir_prefix_owned(rel_path);
    let rel_path = strip_leading_slashes_owned(rel_path);
    if rel_path.is_empty() {
        return Some(String::new());
    }

    let no_ext = strip_markdown_extension(&rel_path);
    let dir = no_ext
        .rsplit_once('/')
        .map(|(value, _)| value)
        .unwrap_or("");
    Some(dir.to_lowercase())
}

fn shortest_unique_wiki_suffix(selected: &WikiDocEntry, wiki_docs: &[WikiDocEntry]) -> String {
    let segments = selected
        .no_ext
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    if segments.is_empty() {
        return selected.no_ext.clone();
    }

    for suffix_len in 1..=segments.len() {
        let suffix = segments[segments.len() - suffix_len..].join("/");
        let suffix_lower = suffix.to_lowercase();
        let match_count = wiki_docs
            .iter()
            .filter(|doc| path_suffix_matches(&doc.no_ext_lower, &suffix_lower))
            .count();
        if match_count == 1 {
            return suffix;
        }
    }

    selected.no_ext.clone()
}

fn unresolved_wiki_target_path(normalized_query: &str, raw_path_part: &str) -> String {
    if normalized_query.is_empty() {
        return String::new();
    }

    let lower_raw = raw_path_part.trim().to_lowercase();
    let prefer_mdx = lower_raw.ends_with(".mdx");
    ensure_markdown_extension(normalized_query, prefer_mdx)
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

fn split_wiki_target_suffix(raw: &str) -> (&str, &str) {
    let hash_index = raw.find('#');
    let block_index = raw.find('^');

    let split_index = match (hash_index, block_index) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    };

    if let Some(index) = split_index {
        (raw[..index].trim(), &raw[index..])
    } else {
        (raw.trim(), "")
    }
}

fn strip_markdown_anchor(raw: &str) -> &str {
    if let Some((path, _anchor)) = raw.split_once('#') {
        path.trim()
    } else {
        raw.trim()
    }
}

fn wiki_query_dependency_key(raw_target: &str) -> Option<String> {
    let trimmed = raw_target.trim();
    if trimmed.is_empty() || is_external_wiki_target(trimmed) {
        return None;
    }

    let (path_part, _suffix) = split_wiki_target_suffix(trimmed);
    if path_part.is_empty() {
        return None;
    }

    let normalized = normalize_wiki_query_path(path_part);
    if normalized.is_empty() {
        return None;
    }

    Some(normalized.to_lowercase())
}

fn normalize_wiki_query_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let normalized = normalize_path_separators(trimmed);
    let normalized = strip_current_dir_prefix_owned(normalized);
    let normalized = strip_leading_slashes_owned(normalized);
    if normalized.is_empty() {
        return String::new();
    }

    let no_ext = strip_markdown_extension(&normalized);
    no_ext.to_string()
}

fn normalize_path_separators(value: &str) -> String {
    let mut normalized = String::with_capacity(value.len());
    let mut previous_was_slash = false;

    for ch in value.chars() {
        if ch == '/' || ch == '\\' {
            if !previous_was_slash {
                normalized.push('/');
                previous_was_slash = true;
            }
            continue;
        }

        normalized.push(ch);
        previous_was_slash = false;
    }

    while normalized.len() > 1 && normalized.ends_with('/') {
        normalized.pop();
    }

    normalized
}

fn strip_current_dir_prefix_owned(mut value: String) -> String {
    while let Some(stripped) = value.strip_prefix("./") {
        value = stripped.to_string();
    }
    value
}

fn strip_leading_slashes_owned(value: String) -> String {
    strip_leading_slashes(&value).to_string()
}

fn strip_leading_slashes(value: &str) -> &str {
    let mut index = 0usize;
    let bytes = value.as_bytes();
    while index < bytes.len() && (bytes[index] == b'/' || bytes[index] == b'\\') {
        index += 1;
    }
    &value[index..]
}

fn path_suffix_matches(path: &str, suffix: &str) -> bool {
    if path == suffix {
        return true;
    }

    if !path.ends_with(suffix) || path.len() <= suffix.len() {
        return false;
    }

    path.as_bytes()[path.len() - suffix.len() - 1] == b'/'
}

fn ensure_markdown_extension(path: &str, prefer_mdx: bool) -> String {
    if has_markdown_extension(path) {
        return path.to_string();
    }

    if prefer_mdx {
        format!("{path}.mdx")
    } else {
        format!("{path}.md")
    }
}

fn strip_markdown_extension(value: &str) -> &str {
    let lower = value.to_lowercase();
    if lower.ends_with(".mdx") {
        return value.get(..value.len().saturating_sub(4)).unwrap_or(value);
    }

    if lower.ends_with(".md") {
        return value.get(..value.len().saturating_sub(3)).unwrap_or(value);
    }

    value
}

fn has_markdown_extension(value: &str) -> bool {
    let lower = value.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".mdx")
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

fn is_external_wiki_target(target: &str) -> bool {
    let trimmed = target.trim();
    if trimmed.starts_with('#') {
        return false;
    }

    if trimmed.starts_with("//") {
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
