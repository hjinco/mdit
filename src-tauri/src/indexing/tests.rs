use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::indexing::files::collect_markdown_files;
use crate::indexing::{get_indexing_meta, IndexSummary};
use crate::migrations;

use super::sync::sync_documents;

fn temp_workspace() -> PathBuf {
    let mut root = std::env::temp_dir();
    let unique = format!("mdit-indexing-tests-{}", unique_id());
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

#[test]
fn counts_indexed_docs_without_embeddings() {
    let root = temp_workspace();
    write_file(&root, "a.md", "[[b]]\n");
    write_file(&root, "b.md", "# B\n");
    write_file(&root, "c.md", "# C\n");

    let mut conn = setup_db(&root);
    let files = collect_files(&root);
    let mut summary = IndexSummary::default();

    sync_documents(&mut conn, &root, files, None, &mut summary).expect("sync failed");

    let meta = get_indexing_meta(&root).expect("failed to load indexing meta");
    assert_eq!(meta.indexed_doc_count, 3);
}
