use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::MarkdownFile;
use super::{LinkResolver, ResolvedLink};

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
    }
}

fn resolve_links(
    root: &Path,
    docs_by_path: HashMap<String, i64>,
    source_rel_path: &str,
    source_doc_id: i64,
    contents: &str,
) -> Vec<ResolvedLink> {
    let resolver = LinkResolver::new(root, docs_by_path);
    let source = make_file(root, source_rel_path);
    resolver.resolve_links(&source, source_doc_id, contents)
}

fn find_link<'a>(links: &'a [ResolvedLink], target_path: &str) -> &'a ResolvedLink {
    links
        .iter()
        .find(|link| link.target_path == target_path)
        .expect("expected link missing")
}

#[test]
fn resolves_wiki_links_with_alias_anchor_and_basename() {
    let root = temp_root();
    let mut docs = HashMap::new();
    docs.insert("target.md".to_string(), 10);
    docs.insert("notes/Target.md".to_string(), 11);
    docs.insert("notes/source.md".to_string(), 1);

    let contents = "[[Target#Section|My Alias]]\n[[notes/Target]]";
    let links = resolve_links(&root, docs, "notes/source.md", 1, contents);

    assert_eq!(links.len(), 2);

    let anchored = links
        .iter()
        .find(|link| link.target_anchor.as_deref() == Some("Section"))
        .expect("anchored link missing");
    assert_eq!(anchored.target_path, "notes/Target.md");
    assert_eq!(anchored.alias.as_deref(), Some("My Alias"));
    assert!(anchored.is_wiki);
    assert!(!anchored.is_embed);
    assert!(!anchored.is_external);

    let direct = links
        .iter()
        .find(|link| link.target_path == "notes/Target.md" && link.target_anchor.is_none())
        .expect("direct link missing");
    assert!(direct.is_wiki);
}

#[test]
fn resolves_markdown_links_and_images_with_relative_paths() {
    let root = temp_root();
    let mut docs = HashMap::new();
    docs.insert("notes/source.md".to_string(), 1);
    docs.insert("target.md".to_string(), 2);

    let contents = "[Go](../target.md#intro)\n![Alt](../target.md)";
    let links = resolve_links(&root, docs, "notes/source.md", 1, contents);

    assert_eq!(links.len(), 2);

    let link = links
        .iter()
        .find(|link| !link.is_embed)
        .expect("markdown link missing");
    assert_eq!(link.target_path, "target.md");
    assert_eq!(link.target_anchor.as_deref(), Some("intro"));
    assert!(!link.is_wiki);
    assert!(!link.is_external);

    let image = links
        .iter()
        .find(|link| link.is_embed)
        .expect("image link missing");
    assert_eq!(image.target_path, "target.md");
    assert!(image.target_anchor.is_none());
    assert!(!image.is_wiki);
}

#[test]
fn ignores_external_and_code_fenced_wiki_links() {
    let root = temp_root();
    let mut docs = HashMap::new();
    docs.insert("keep.md".to_string(), 2);
    docs.insert("notes/source.md".to_string(), 1);

    let contents = r#"[Ext](https://example.com)

```md
[[External]]
```

inline `[[Nope]]` still code

[[Keep]]
"#;

    let links = resolve_links(&root, docs, "notes/source.md", 1, contents);

    assert_eq!(links.len(), 1);
    let keep = find_link(&links, "keep.md");
    assert!(keep.is_wiki);
}

#[test]
fn dedupes_identical_links() {
    let root = temp_root();
    let mut docs = HashMap::new();
    docs.insert("dup.md".to_string(), 9);
    docs.insert("notes/source.md".to_string(), 1);

    let contents = "[[Dup]] and again [[Dup]]";
    let links = resolve_links(&root, docs, "notes/source.md", 1, contents);

    assert_eq!(links.len(), 1);
    let dup = find_link(&links, "dup.md");
    assert!(dup.is_wiki);
}
