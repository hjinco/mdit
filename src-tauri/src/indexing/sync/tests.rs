use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::indexing::files::collect_markdown_files;
use crate::indexing::IndexSummary;
use crate::migrations;

use super::sync_documents;

#[derive(Debug)]
struct LinkRow {
    source_doc_id: i64,
    target_doc_id: Option<i64>,
    target_path: String,
    target_anchor: Option<String>,
    is_embed: bool,
    is_wiki: bool,
}

fn temp_workspace() -> PathBuf {
    let mut root = std::env::temp_dir();
    let unique = format!("mdit-sync-tests-{}", unique_id());
    root.push(unique);
    std::fs::create_dir_all(&root).expect("failed to create temp workspace");
    root
}

fn unique_id() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time went backwards")
        .as_nanos()
}

fn write_file(root: &Path, rel_path: &str, contents: &str) {
    let path = root.join(rel_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("failed to create parent directory");
    }
    std::fs::write(path, contents).expect("failed to write file");
}

fn setup_db(root: &Path) -> Connection {
    let db_path = migrations::run_workspace_migrations(root).expect("failed to run migrations");
    let conn = Connection::open(&db_path).expect("failed to open sqlite db");
    conn.pragma_update(None, "foreign_keys", &1)
        .expect("failed to enable foreign keys");
    conn
}

fn collect_files(root: &Path) -> Vec<crate::indexing::files::MarkdownFile> {
    collect_markdown_files(root).expect("failed to collect markdown files")
}

fn bool_from_int(value: i32) -> bool {
    value != 0
}

fn load_links(conn: &Connection) -> Vec<LinkRow> {
    let mut stmt = conn
        .prepare(
            "SELECT source_doc_id, target_doc_id, target_path, target_anchor, is_embed, is_wiki \
             FROM link \
             ORDER BY source_doc_id, target_path, target_anchor, is_embed, is_wiki",
        )
        .expect("failed to prepare link query");

    let rows = stmt
        .query_map([], |row| {
            let is_embed: i32 = row.get(4)?;
            let is_wiki: i32 = row.get(5)?;
            Ok(LinkRow {
                source_doc_id: row.get(0)?,
                target_doc_id: row.get(1)?,
                target_path: row.get(2)?,
                target_anchor: row.get(3)?,
                is_embed: bool_from_int(is_embed),
                is_wiki: bool_from_int(is_wiki),
            })
        })
        .expect("failed to query link rows");

    rows.map(|row| row.expect("failed to read link row"))
        .collect()
}

fn load_doc_ids(conn: &Connection) -> HashMap<String, i64> {
    let mut stmt = conn
        .prepare("SELECT id, rel_path FROM doc")
        .expect("failed to prepare doc query");
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .expect("failed to read doc rows");

    let mut map = HashMap::new();
    for row in rows {
        let (id, rel_path) = row.expect("failed to read doc row");
        map.insert(rel_path, id);
    }
    map
}

#[test]
fn writes_links_without_embeddings() {
    let root = temp_workspace();
    write_file(
        &root,
        "a.md",
        "[[b]]\n[C](sub/c.md#head)\n![Embed](b.md)\n[Ext](https://example.com)\n",
    );
    write_file(&root, "b.md", "# B\n");
    write_file(&root, "sub/c.md", "# Head\n");

    let mut conn = setup_db(&root);
    let files = collect_files(&root);
    let mut summary = IndexSummary::default();

    sync_documents(&mut conn, &root, files, None, &mut summary).expect("sync failed");

    assert_eq!(summary.links_written, 3);
    assert_eq!(summary.links_deleted, 0);

    let links = load_links(&conn);
    assert_eq!(links.len(), 3);

    let doc_ids = load_doc_ids(&conn);
    let source_id = *doc_ids.get("a.md").expect("missing a.md id");
    let b_id = *doc_ids.get("b.md").expect("missing b.md id");
    let c_id = *doc_ids.get("sub/c.md").expect("missing c.md id");

    let wiki = links
        .iter()
        .find(|link| link.is_wiki && link.target_path == "b.md" && !link.is_embed)
        .expect("wiki link missing");
    assert_eq!(wiki.source_doc_id, source_id);
    assert_eq!(wiki.target_doc_id, Some(b_id));
    assert!(wiki.target_anchor.is_none());

    let markdown = links
        .iter()
        .find(|link| !link.is_wiki && !link.is_embed && link.target_path == "sub/c.md")
        .expect("markdown link missing");
    assert_eq!(markdown.source_doc_id, source_id);
    assert_eq!(markdown.target_doc_id, Some(c_id));
    assert_eq!(markdown.target_anchor.as_deref(), Some("head"));

    let image = links
        .iter()
        .find(|link| link.is_embed && link.target_path == "b.md")
        .expect("image link missing");
    assert_eq!(image.source_doc_id, source_id);
    assert_eq!(image.target_doc_id, Some(b_id));
    assert!(image.target_anchor.is_none());
}

#[test]
fn skips_refresh_when_content_unchanged() {
    let root = temp_workspace();
    write_file(&root, "a.md", "[[b]]\n[C](sub/c.md#head)\n![Embed](b.md)\n");
    write_file(&root, "b.md", "# B\n");
    write_file(&root, "sub/c.md", "# Head\n");

    let mut conn = setup_db(&root);
    let files = collect_files(&root);
    let mut summary = IndexSummary::default();
    sync_documents(&mut conn, &root, files, None, &mut summary).expect("initial sync failed");

    let files = collect_files(&root);
    let mut summary = IndexSummary::default();
    sync_documents(&mut conn, &root, files, None, &mut summary).expect("second sync failed");

    assert_eq!(summary.links_written, 0);
    assert_eq!(summary.links_deleted, 0);
    assert_eq!(load_links(&conn).len(), 3);
}

#[test]
fn replaces_links_on_content_change() {
    let root = temp_workspace();
    write_file(&root, "a.md", "[[b]]\n[C](sub/c.md#head)\n![Embed](b.md)\n");
    write_file(&root, "b.md", "# B\n");
    write_file(&root, "sub/c.md", "# Head\n");

    let mut conn = setup_db(&root);
    let files = collect_files(&root);
    let mut summary = IndexSummary::default();
    sync_documents(&mut conn, &root, files, None, &mut summary).expect("initial sync failed");

    write_file(&root, "a.md", "[[b]]\n");

    let files = collect_files(&root);
    let mut summary = IndexSummary::default();
    sync_documents(&mut conn, &root, files, None, &mut summary).expect("refresh sync failed");

    assert_eq!(summary.links_deleted, 3);
    assert_eq!(summary.links_written, 1);

    let links = load_links(&conn);
    assert_eq!(links.len(), 1);
    assert_eq!(links[0].target_path, "b.md");
}

#[test]
fn refreshes_links_when_new_doc_is_added() {
    let root = temp_workspace();
    write_file(&root, "a.md", "[[new-doc]]\n");

    let mut conn = setup_db(&root);
    let files = collect_files(&root);
    let mut summary = IndexSummary::default();
    sync_documents(&mut conn, &root, files, None, &mut summary).expect("initial sync failed");

    let links = load_links(&conn);
    assert_eq!(links.len(), 1);
    assert_eq!(links[0].target_path, "new-doc.md");
    assert!(links[0].target_doc_id.is_none());

    write_file(&root, "new-doc.md", "# New Doc\n");

    let files = collect_files(&root);
    let mut summary = IndexSummary::default();
    sync_documents(&mut conn, &root, files, None, &mut summary).expect("second sync failed");

    assert_eq!(summary.links_deleted, 1);
    assert_eq!(summary.links_written, 1);

    let links = load_links(&conn);
    assert_eq!(links.len(), 1);
    let doc_ids = load_doc_ids(&conn);
    let new_id = *doc_ids.get("new-doc.md").expect("missing new-doc id");
    assert_eq!(links[0].target_doc_id, Some(new_id));
}
