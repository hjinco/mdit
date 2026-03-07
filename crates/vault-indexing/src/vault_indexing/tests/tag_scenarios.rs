use std::{thread, time::Duration};

use super::super::{delete_indexed_note, rename_indexed_note};
use super::test_support::IndexingHarness;

#[test]
fn given_inline_and_frontmatter_tags_when_indexing_then_doc_tags_are_merged_and_deduped() {
    let harness = IndexingHarness::new("mdit-vault-indexing-tags-merged");
    let contents = [
        "---",
        "tags:",
        "  - Project",
        "  - '#Project/Alpha'",
        "---",
        "Body #project and #Project/Beta",
    ]
    .join("\n");
    harness.write_note("note.md", &contents);

    harness.run_workspace_index();

    assert_eq!(
        harness.doc_tags("note.md"),
        vec![
            ("Project".to_string(), "project".to_string()),
            ("Project/Alpha".to_string(), "project/alpha".to_string()),
            ("Project/Beta".to_string(), "project/beta".to_string()),
        ]
    );
}

#[test]
fn given_parent_tag_query_when_searching_then_descendants_are_included_in_modified_order() {
    let harness = IndexingHarness::new("mdit-vault-indexing-tags-parent-search");
    harness.write_note("older.md", "Body #project");
    thread::sleep(Duration::from_millis(20));
    harness.write_note("newer.md", "Body #project/alpha");

    harness.run_workspace_index();

    assert_eq!(
        harness.search_tags("#project"),
        vec![
            harness
                .root()
                .join("newer.md")
                .to_string_lossy()
                .into_owned(),
            harness
                .root()
                .join("older.md")
                .to_string_lossy()
                .into_owned(),
        ]
    );
}

#[test]
fn given_renamed_or_deleted_note_when_searching_tags_then_doc_tag_rows_follow_doc_lifecycle() {
    let harness = IndexingHarness::new("mdit-vault-indexing-tags-lifecycle");
    harness.write_note("old.md", "Body #project/alpha");
    harness.run_workspace_index();

    std::fs::rename(harness.root().join("old.md"), harness.root().join("new.md"))
        .expect("failed to rename note on disk");

    let renamed = rename_indexed_note(
        harness.root(),
        harness.db_path(),
        &harness.root().join("old.md"),
        &harness.root().join("new.md"),
    )
    .expect("rename should succeed");

    assert!(renamed);
    assert_eq!(
        harness.search_tags("#project"),
        vec![harness.root().join("new.md").to_string_lossy().into_owned()]
    );

    std::fs::remove_file(harness.root().join("new.md")).expect("failed to remove renamed note");
    let deleted = delete_indexed_note(
        harness.root(),
        harness.db_path(),
        &harness.root().join("new.md"),
    )
    .expect("delete should succeed");

    assert!(deleted);
    assert!(harness.search_tags("#project").is_empty());
}

#[test]
fn given_heading_markers_and_non_tag_hashes_when_indexing_then_only_real_tags_are_persisted() {
    let harness = IndexingHarness::new("mdit-vault-indexing-tags-false-positives");
    let contents = [
        "# Heading",
        "C# is not a tag.",
        "Ignore https://example.com/#anchor and `#code` and [#link](https://example.com).",
        "Keep #valid and #nested/tag.",
    ]
    .join("\n");
    harness.write_note("note.md", &contents);

    harness.run_workspace_index();

    assert_eq!(
        harness.doc_tags("note.md"),
        vec![
            ("nested/tag".to_string(), "nested/tag".to_string()),
            ("valid".to_string(), "valid".to_string()),
        ]
    );
}

#[test]
fn given_chunking_version_drift_when_reindexing_with_embeddings_then_doc_tags_are_preserved() {
    let harness = IndexingHarness::new("mdit-vault-indexing-tags-chunk-drift");
    harness.write_note("note.md", "Body #project/alpha");

    harness.run_workspace_index_with_embeddings("test", "model-a");
    harness.set_doc_chunking_version("note.md", 0);

    harness.run_workspace_index_with_embeddings("test", "model-a");

    assert_eq!(
        harness.doc_tags("note.md"),
        vec![("project/alpha".to_string(), "project/alpha".to_string())]
    );
    assert_eq!(
        harness.search_tags("#project"),
        vec![harness
            .root()
            .join("note.md")
            .to_string_lossy()
            .into_owned()]
    );
}

#[test]
fn given_embedding_model_drift_when_reindexing_with_embeddings_then_doc_tags_are_preserved() {
    let harness = IndexingHarness::new("mdit-vault-indexing-tags-embedding-drift");
    harness.write_note("note.md", "Body #project/alpha");

    harness.run_workspace_index_with_embeddings("test", "model-a");
    harness.run_workspace_index_with_embeddings("test", "model-b");

    assert_eq!(
        harness.doc_tags("note.md"),
        vec![("project/alpha".to_string(), "project/alpha".to_string())]
    );
    assert_eq!(
        harness.search_tags("#project"),
        vec![harness
            .root()
            .join("note.md")
            .to_string_lossy()
            .into_owned()]
    );
}
