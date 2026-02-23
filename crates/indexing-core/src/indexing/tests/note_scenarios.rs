use std::path::PathBuf;

use rusqlite::{params, Connection};

use super::super::{delete_indexed_note, get_related_notes, rename_indexed_note};
use super::test_support::IndexingHarness;

#[test]
fn given_deleted_note_when_indexing_single_note_then_other_docs_are_not_pruned() {
    let harness = IndexingHarness::new("mdit-indexing-note-no-prune");
    harness.write_note("a.md", "[[b]]\n");
    harness.write_note("b.md", "# B\n");

    harness.run_workspace_index();
    harness.remove_note("b.md");
    harness.write_note("a.md", "# Updated\n");

    let summary = harness
        .run_note_index("a.md")
        .expect("single-note indexing should succeed");

    assert_eq!(summary.files_discovered, 1);
    assert_eq!(summary.files_processed, 1);
    assert_eq!(summary.docs_deleted, 0);
    assert_eq!(harness.meta().indexed_doc_count, 2);
}

#[test]
fn given_note_path_outside_workspace_when_indexing_single_note_then_it_is_rejected() {
    let harness = IndexingHarness::new("mdit-indexing-note-outside");
    harness.write_note("a.md", "# A\n");

    let outside_path = outside_markdown_path();
    std::fs::write(&outside_path, "# Outside\n").expect("failed to create outside note");

    let error = harness
        .run_note_index_for_path(&outside_path)
        .expect_err("outside path should fail");

    assert!(error.to_string().contains("outside workspace"));

    let _ = std::fs::remove_file(outside_path);
}

#[test]
fn given_non_markdown_note_path_when_indexing_single_note_then_it_is_rejected() {
    let harness = IndexingHarness::new("mdit-indexing-note-extension");
    harness.write_note("note.txt", "plain text");

    let error = harness
        .run_note_index("note.txt")
        .expect_err("non-markdown path should fail");

    assert!(error.to_string().contains("markdown"));
}

#[test]
fn given_multiple_links_from_same_source_when_loading_backlinks_then_each_source_appears_once() {
    let harness = IndexingHarness::new("mdit-indexing-backlinks-dedupe");
    harness.write_note("target.md", "# Target\n");
    harness.write_note(
        "source-a.md",
        "[[target]]\n[[target]]\n[Alias](target.md)\n",
    );
    harness.write_note("source-b.md", "[[target]]\n");

    harness.run_workspace_index();

    let backlinks = harness.backlinks("target.md");
    let rel_paths = backlinks
        .iter()
        .map(|entry| entry.rel_path.clone())
        .collect::<Vec<_>>();

    assert_eq!(rel_paths, vec!["source-a.md", "source-b.md"]);
}

#[test]
fn given_note_with_frontmatter_when_indexing_then_doc_content_uses_values_not_keys() {
    let harness = IndexingHarness::new("mdit-indexing-frontmatter-values");
    let note_contents = [
        "---",
        "title: Search Title",
        "tags:",
        "  - rust",
        "  - tauri",
        "metadata:",
        "  priority: 3",
        "---",
        "# Heading",
        "Body with **markdown** and [link](https://example.com)",
    ]
    .join("\n");
    harness.write_note("a.md", &note_contents);

    harness.run_workspace_index();
    let content = harness
        .doc_content("a.md")
        .expect("indexed doc content should exist");

    assert!(content.contains("Search Title"));
    assert!(content.contains("rust"));
    assert!(content.contains("tauri"));
    assert!(content.contains("3"));
    assert!(!content.contains("title:"));
    assert!(!content.contains("tags:"));
    assert!(!content.contains("priority:"));
    assert!(content.contains("# Heading"));
    assert!(content.contains("Body with **markdown** and [link](https://example.com)"));
}

#[test]
fn given_indexed_vectors_when_loading_related_notes_then_it_returns_ranked_matches_excluding_self()
{
    let harness = IndexingHarness::new("mdit-indexing-related-ranked");
    harness.write_note("source.md", &("source ".repeat(64)));
    harness.write_note("near.md", &("near ".repeat(64)));
    harness.write_note("far.md", &("far ".repeat(64)));
    harness.write_note("mismatch.md", &("mismatch ".repeat(64)));
    harness.run_workspace_index();

    set_doc_embedding(&harness, "source.md", "model-a", 2, &[1.0, 0.0]);
    set_doc_embedding(&harness, "near.md", "model-a", 2, &[0.9, 0.1]);
    set_doc_embedding(&harness, "far.md", "model-a", 2, &[-1.0, 0.0]);
    set_doc_embedding(&harness, "mismatch.md", "model-b", 2, &[1.0, 0.0]);

    let related = get_related_notes(
        harness.root(),
        harness.db_path(),
        &harness.root().join("source.md"),
        5,
    )
    .expect("related note lookup should succeed");

    let rel_paths = related
        .iter()
        .map(|entry| entry.rel_path.clone())
        .collect::<Vec<_>>();

    assert_eq!(rel_paths, vec!["near.md"]);
}

#[test]
fn given_limit_when_loading_related_notes_then_it_caps_results() {
    let harness = IndexingHarness::new("mdit-indexing-related-limit");
    harness.write_note("source.md", &("source ".repeat(64)));
    harness.write_note("near-1.md", &("near-1 ".repeat(64)));
    harness.write_note("near-2.md", &("near-2 ".repeat(64)));
    harness.run_workspace_index();

    set_doc_embedding(&harness, "source.md", "model-a", 2, &[1.0, 0.0]);
    set_doc_embedding(&harness, "near-1.md", "model-a", 2, &[0.95, 0.05]);
    set_doc_embedding(&harness, "near-2.md", "model-a", 2, &[0.9, 0.1]);

    let related = get_related_notes(
        harness.root(),
        harness.db_path(),
        &harness.root().join("source.md"),
        1,
    )
    .expect("related note lookup should succeed");

    assert_eq!(related.len(), 1);
    assert_eq!(related[0].rel_path, "near-1.md");
}

#[test]
fn given_source_without_embedding_metadata_when_loading_related_notes_then_it_returns_empty() {
    let harness = IndexingHarness::new("mdit-indexing-related-empty");
    harness.write_note("source.md", &("source ".repeat(64)));
    harness.write_note("other.md", &("other ".repeat(64)));
    harness.run_workspace_index();

    let related = get_related_notes(
        harness.root(),
        harness.db_path(),
        &harness.root().join("source.md"),
        5,
    )
    .expect("related note lookup should succeed");

    assert!(related.is_empty());
}

#[test]
fn given_indexed_note_when_renaming_single_indexed_note_then_doc_id_is_preserved() {
    let harness = IndexingHarness::new("mdit-indexing-rename-indexed-note");
    harness.write_note("old.md", "# old");
    harness.write_note("source.md", "[[old]]");
    harness.run_workspace_index();

    let old_doc_id = harness.doc_id("old.md").expect("expected old doc id");
    std::fs::rename(harness.root().join("old.md"), harness.root().join("new.md"))
        .expect("failed to rename note on fs");

    let renamed = rename_indexed_note(
        harness.root(),
        harness.db_path(),
        &harness.root().join("old.md"),
        &harness.root().join("new.md"),
    )
    .expect("rename indexed note should succeed");

    assert!(renamed);
    assert!(harness.doc_id("old.md").is_none());
    assert_eq!(harness.doc_id("new.md"), Some(old_doc_id));
    assert_eq!(
        harness
            .backlinks("new.md")
            .into_iter()
            .map(|entry| entry.rel_path)
            .collect::<Vec<_>>(),
        vec!["source.md".to_string()]
    );
}

#[test]
fn given_indexed_note_when_deleting_single_indexed_note_then_doc_row_is_removed() {
    let harness = IndexingHarness::new("mdit-indexing-delete-indexed-note");
    harness.write_note("target.md", "# target");
    harness.write_note("source.md", "[[target]]");
    harness.run_workspace_index();

    assert!(harness.doc_id("target.md").is_some());

    let deleted = delete_indexed_note(
        harness.root(),
        harness.db_path(),
        &harness.root().join("target.md"),
    )
    .expect("delete indexed note should succeed");

    assert!(deleted);
    assert!(harness.doc_id("target.md").is_none());
}

#[test]
fn given_source_link_to_deleted_target_when_deleting_indexed_note_then_target_doc_binding_is_cleared(
) {
    let harness = IndexingHarness::new("mdit-indexing-delete-link-target-clear");
    harness.write_note("target.md", "# target");
    harness.write_note("source.md", "[[target]]");
    harness.run_workspace_index();

    let deleted = delete_indexed_note(
        harness.root(),
        harness.db_path(),
        &harness.root().join("target.md"),
    )
    .expect("delete indexed note should succeed");

    assert!(deleted);
    assert_eq!(
        harness.link_rows_for("source.md"),
        vec![("target.md".to_string(), None)]
    );
}

#[test]
fn given_missing_indexed_note_when_deleting_then_it_returns_false() {
    let harness = IndexingHarness::new("mdit-indexing-delete-indexed-note-missing");
    harness.write_note("source.md", "# source");
    harness.run_workspace_index();

    let deleted = delete_indexed_note(
        harness.root(),
        harness.db_path(),
        &harness.root().join("missing.md"),
    )
    .expect("delete indexed note should succeed");

    assert!(!deleted);
}

fn set_doc_embedding(
    harness: &IndexingHarness,
    rel_path: &str,
    model: &str,
    dim: i32,
    vector: &[f32],
) {
    app_storage::sqlite_ext::register_auto_extension()
        .expect("failed to register sqlite vec extension");

    let conn = Connection::open(harness.db_path()).expect("failed to open test sqlite db");
    conn.pragma_update(None, "foreign_keys", 1)
        .expect("failed to enable foreign keys");

    let vault_id = app_storage::vault::find_workspace_id(&conn, harness.root())
        .expect("failed to resolve vault id")
        .expect("expected vault id to exist");

    let doc_id: i64 = conn
        .query_row(
            "SELECT id FROM doc WHERE vault_id = ?1 AND rel_path = ?2",
            params![vault_id, rel_path],
            |row| row.get(0),
        )
        .expect("failed to resolve doc id");

    conn.execute(
        "UPDATE doc SET last_embedding_model = ?1, last_embedding_dim = ?2 WHERE id = ?3",
        params![model, dim, doc_id],
    )
    .expect("failed to update embedding metadata");

    let mut stmt = conn
        .prepare("SELECT id FROM segment WHERE doc_id = ?1 ORDER BY id")
        .expect("failed to prepare segment query");
    let mut segment_ids = stmt
        .query_map(params![doc_id], |row| row.get::<_, i64>(0))
        .expect("failed to query segment ids")
        .map(|row| row.expect("failed to decode segment id"))
        .collect::<Vec<_>>();

    if segment_ids.is_empty() {
        conn.execute(
            "INSERT INTO segment (doc_id, ordinal, last_hash) VALUES (?1, ?2, ?3)",
            params![doc_id, 0, format!("manual-segment-{doc_id}")],
        )
        .expect("failed to create fallback segment");
        segment_ids.push(conn.last_insert_rowid());
    }

    let embedding = embedding_bytes(vector);
    for segment_id in segment_ids {
        conn.execute(
            "INSERT OR REPLACE INTO segment_vec (rowid, embedding) VALUES (?1, vec_f32(?2))",
            params![segment_id, &embedding],
        )
        .expect("failed to write segment embedding");
    }
}

fn embedding_bytes(vector: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(vector.len() * 4);
    for value in vector {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

fn outside_markdown_path() -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push(format!("mdit-indexing-outside-{}.md", unique_id()));
    path
}

fn unique_id() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time went backwards")
        .as_nanos()
}
