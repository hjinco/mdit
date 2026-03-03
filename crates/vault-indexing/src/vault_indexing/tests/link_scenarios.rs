use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::super::files::MarkdownFile;
use super::super::links::{resolve_wiki_link_target, LinkResolution, LinkResolver, ResolvedLink};

fn temp_root() -> PathBuf {
    let mut root = std::env::temp_dir();
    let unique = format!("mdit-link-tests-{}", unique_id());
    root.push(unique);
    std::fs::create_dir_all(&root).expect("failed to create temp root");
    root
}

fn unique_id() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time went backwards")
        .as_nanos()
}

fn make_file(root: &Path, rel_path: &str) -> MarkdownFile {
    MarkdownFile {
        abs_path: root.join(rel_path),
        rel_path: rel_path.replace('\\', "/"),
        last_source_size: None,
        last_source_mtime_ns: None,
    }
}

fn resolve_links(
    root: &Path,
    docs_by_path: HashMap<String, i64>,
    source_rel_path: &str,
    contents: &str,
) -> Vec<ResolvedLink> {
    let resolver = LinkResolver::new(root, docs_by_path);
    let source = make_file(root, source_rel_path);
    resolver.resolve_links(&source, contents)
}

fn resolve_with_dependencies(
    root: &Path,
    docs_by_path: HashMap<String, i64>,
    source_rel_path: &str,
    contents: &str,
) -> LinkResolution {
    let resolver = LinkResolver::new(root, docs_by_path);
    let source = make_file(root, source_rel_path);
    resolver.resolve_links_with_dependencies(&source, contents)
}

fn resolve_wiki_target(
    root: &Path,
    current_note_path: Option<&Path>,
    raw_target: &str,
    rel_paths: &[&str],
) -> super::super::links::ResolvedWikiLinkTarget {
    let workspace_rel_paths = rel_paths
        .iter()
        .map(|path| (*path).to_string())
        .collect::<Vec<_>>();

    resolve_wiki_link_target(
        root,
        current_note_path.and_then(|path| path.to_str()),
        raw_target,
        &workspace_rel_paths,
    )
}

fn find_link<'a>(links: &'a [ResolvedLink], target_path: &str) -> &'a ResolvedLink {
    links
        .iter()
        .find(|link| link.target_path == target_path)
        .expect("expected link missing")
}

#[test]
fn resolves_wiki_links_and_ignores_anchor_alias() {
    let root = temp_root();
    let mut docs = HashMap::new();
    docs.insert("target.md".to_string(), 10);

    let contents = "[[Target#Section|My Alias]]";
    let links = resolve_links(&root, docs, "notes/source.md", contents);

    assert_eq!(links.len(), 1);
    let target = find_link(&links, "target.md");
    assert_eq!(target.target_doc_id, Some(10));
}

#[test]
fn resolves_markdown_links_and_ignores_images_and_anchor_only_links() {
    let root = temp_root();
    let mut docs = HashMap::new();
    docs.insert("target.md".to_string(), 2);

    let contents = "[Go](../target.md#intro)\n![Alt](../target.md)\n[Section](#intro)";
    let links = resolve_links(&root, docs, "notes/source.md", contents);

    assert_eq!(links.len(), 1);
    let link = links.first().expect("markdown link missing");
    assert_eq!(link.target_path, "target.md");
    assert_eq!(link.target_doc_id, Some(2));
}

#[test]
fn ignores_external_embeds_and_code_fenced_wiki_links() {
    let root = temp_root();
    let mut docs = HashMap::new();
    docs.insert("keep.md".to_string(), 2);

    let contents = r#"[Ext](https://example.com)

```md
[[External]]
```

inline `[[Nope]]` still code

![[Keep]]
[[Keep]]
"#;

    let links = resolve_links(&root, docs, "notes/source.md", contents);

    assert_eq!(links.len(), 1);
    assert_eq!(find_link(&links, "keep.md").target_doc_id, Some(2));
}

#[test]
fn dedupes_identical_links() {
    let root = temp_root();
    let mut docs = HashMap::new();
    docs.insert("dup.md".to_string(), 9);

    let contents = "[[Dup]] and [again](../dup.md#head) and [[Dup|Alias]]";
    let links = resolve_links(&root, docs, "notes/source.md", contents);

    assert_eq!(links.len(), 1);
    assert_eq!(find_link(&links, "dup.md").target_doc_id, Some(9));
}

#[test]
fn collects_wiki_query_dependencies_for_basename_and_path_queries() {
    let root = temp_root();
    let docs = HashMap::new();
    let contents = "[[Note]] [[note.md#head]] [[dir/note]] [[Another|Alias]]";

    let resolution = resolve_with_dependencies(&root, docs, "source.md", contents);

    let mut keys = resolution.wiki_query_keys.into_iter().collect::<Vec<_>>();
    keys.sort();
    assert_eq!(keys, vec!["another", "dir/note", "note"]);
}

#[test]
fn resolves_wiki_target_basename_unique_with_shortest_canonical() {
    let root = temp_root();
    let resolved = resolve_wiki_target(&root, None, "Project.md", &["docs/Project.md"]);

    assert_eq!(resolved.canonical_target, "Project");
    assert_eq!(
        resolved.resolved_rel_path.as_deref(),
        Some("docs/Project.md")
    );
    assert_eq!(resolved.match_count, 1);
    assert!(!resolved.disambiguated);
    assert!(!resolved.unresolved);
}

#[test]
fn resolves_wiki_target_ambiguous_basename_preferring_current_directory() {
    let root = temp_root();
    let current = root.join("notes/b/source.md");

    let resolved = resolve_wiki_target(
        &root,
        Some(current.as_path()),
        "note",
        &["notes/a/note.md", "notes/b/note.md"],
    );

    assert_eq!(resolved.canonical_target, "b/note");
    assert_eq!(
        resolved.resolved_rel_path.as_deref(),
        Some("notes/b/note.md")
    );
    assert_eq!(resolved.match_count, 2);
    assert!(resolved.disambiguated);
    assert!(!resolved.unresolved);
}

#[test]
fn resolves_wiki_target_path_suffix_query() {
    let root = temp_root();
    let resolved = resolve_wiki_target(
        &root,
        None,
        "docs/project/note",
        &[
            "docs/project/note.md",
            "archive/project/note.md",
            "other/file.md",
        ],
    );

    assert_eq!(resolved.canonical_target, "docs/project/note");
    assert_eq!(
        resolved.resolved_rel_path.as_deref(),
        Some("docs/project/note.md")
    );
    assert_eq!(resolved.match_count, 1);
    assert!(!resolved.disambiguated);
    assert!(!resolved.unresolved);
}

#[test]
fn returns_unresolved_wiki_target_with_normalized_query_and_suffix() {
    let root = temp_root();
    let resolved = resolve_wiki_target(&root, None, "/DIR\\New.Note.mdx#A", &[]);

    assert_eq!(resolved.canonical_target, "DIR/New.Note#A");
    assert_eq!(resolved.resolved_rel_path, None);
    assert_eq!(resolved.match_count, 0);
    assert!(!resolved.disambiguated);
    assert!(resolved.unresolved);
}

#[test]
fn resolves_wiki_target_with_shortest_unique_suffix_canonical() {
    let root = temp_root();
    let resolved = resolve_wiki_target(
        &root,
        None,
        "gamma/deep/topic",
        &["alpha/topic.md", "beta/topic.md", "gamma/deep/topic.md"],
    );

    assert_eq!(resolved.canonical_target, "deep/topic");
    assert_eq!(
        resolved.resolved_rel_path.as_deref(),
        Some("gamma/deep/topic.md")
    );
    assert_eq!(resolved.match_count, 1);
    assert!(!resolved.disambiguated);
    assert!(!resolved.unresolved);
}
