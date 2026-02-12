use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};

use crate::indexing::files::collect_markdown_files;
use crate::indexing::{get_indexing_meta, index_note, IndexSummary};
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

fn load_source_link_targets(conn: &Connection, source_rel_path: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            "SELECT l.target_path \
             FROM link l \
             JOIN doc d ON d.id = l.source_doc_id \
             WHERE d.rel_path = ?1 \
             ORDER BY l.target_path",
        )
        .expect("failed to prepare link target query");

    let rows = stmt
        .query_map(params![source_rel_path], |row| row.get::<_, String>(0))
        .expect("failed to read link targets");

    rows.map(|row| row.expect("failed to read link target row"))
        .collect()
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

#[test]
fn index_note_updates_target_and_does_not_prune_other_docs() {
    let root = temp_workspace();
    write_file(&root, "a.md", "[[b]]\n");
    write_file(&root, "b.md", "# B\n");
    write_file(&root, "c.md", "# C\n");

    let mut conn = setup_db(&root);
    let files = collect_files(&root);
    let mut summary = IndexSummary::default();
    sync_documents(&mut conn, &root, files, None, &mut summary).expect("initial sync failed");

    std::fs::remove_file(root.join("b.md")).expect("failed to remove b.md");
    write_file(&root, "a.md", "[[c]]\n");

    let note_summary =
        index_note(&root, &root.join("a.md"), "", "").expect("index_note should succeed");
    assert_eq!(note_summary.files_discovered, 1);
    assert_eq!(note_summary.files_processed, 1);
    assert_eq!(note_summary.docs_deleted, 0);

    let meta = get_indexing_meta(&root).expect("failed to load indexing meta");
    assert_eq!(meta.indexed_doc_count, 3);

    let conn = setup_db(&root);
    let targets = load_source_link_targets(&conn, "a.md");
    assert_eq!(targets, vec!["c.md"]);
}

#[test]
fn index_note_rejects_paths_outside_workspace() {
    let root = temp_workspace();
    write_file(&root, "a.md", "# A\n");

    let outside_path =
        std::env::temp_dir().join(format!("mdit-indexing-outside-{}.md", unique_id()));
    std::fs::write(&outside_path, "# Outside\n").expect("failed to write outside file");

    let error =
        index_note(&root, &outside_path, "", "").expect_err("expected outside path to fail");
    assert!(error.to_string().contains("outside workspace"));
}

#[test]
fn index_note_rejects_non_markdown_paths() {
    let root = temp_workspace();
    write_file(&root, "note.txt", "plain text");

    let error = index_note(&root, &root.join("note.txt"), "", "")
        .expect_err("expected non-markdown file to fail");
    assert!(error.to_string().contains("markdown"));
}
