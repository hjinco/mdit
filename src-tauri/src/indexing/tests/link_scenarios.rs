use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::super::files::MarkdownFile;
use super::super::links::{LinkResolver, ResolvedLink};

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
    contents: &str,
) -> Vec<ResolvedLink> {
    let resolver = LinkResolver::new(root, docs_by_path);
    let source = make_file(root, source_rel_path);
    resolver.resolve_links(&source, contents)
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
