use super::test_support::IndexingHarness;

#[test]
fn given_deleted_preferred_wiki_target_when_reindexing_workspace_then_link_rebinds_to_remaining_target(
) {
    let harness = IndexingHarness::new("mdit-indexing-sync-rebind-target");
    harness.write_note("source.md", "[[note]]\n");
    harness.write_note("a/note.md", "# A Note\n");
    harness.write_note("b/note.md", "# B Note\n");

    harness.run_workspace_index();
    assert_eq!(harness.link_targets_for("source.md"), vec!["a/note.md"]);

    harness.remove_note("a/note.md");
    let summary = harness.run_workspace_index();

    assert_eq!(summary.docs_deleted, 1);
    assert_eq!(summary.links_deleted, 1);
    assert_eq!(summary.links_written, 1);
    assert_eq!(harness.link_targets_for("source.md"), vec!["b/note.md"]);
    assert_eq!(harness.meta().indexed_doc_count, 2);
}

#[test]
fn given_deleted_note_when_reindexing_workspace_then_deleted_doc_is_pruned_and_source_link_stays_unresolved(
) {
    let harness = IndexingHarness::new("mdit-indexing-sync-prune-doc");
    harness.write_note("a.md", "[[b]]\n");
    harness.write_note("b.md", "# B\n");

    harness.run_workspace_index();
    harness.remove_note("b.md");

    let summary = harness.run_workspace_index();

    assert_eq!(summary.docs_deleted, 1);
    assert_eq!(summary.links_deleted, 1);
    assert_eq!(summary.links_written, 1);
    assert_eq!(harness.meta().indexed_doc_count, 1);
    assert_eq!(harness.doc_content("b.md"), None);
    assert_eq!(harness.link_targets_for("a.md"), vec!["b.md"]);
}

#[test]
fn given_content_changed_without_embeddings_when_reindexing_then_doc_content_is_updated() {
    let harness = IndexingHarness::new("mdit-indexing-sync-content-update");
    harness.write_note(
        "a.md",
        &["---", "title: Old Title", "---", "Old body sentence."].join("\n"),
    );

    harness.run_workspace_index();
    harness.write_note(
        "a.md",
        &[
            "---",
            "title: New Title",
            "status: updated",
            "---",
            "New body sentence.",
        ]
        .join("\n"),
    );

    let summary = harness.run_workspace_index();
    let content = harness
        .doc_content("a.md")
        .expect("indexed doc content should exist");

    assert_eq!(summary.links_written, 0);
    assert_eq!(summary.links_deleted, 0);
    assert!(content.contains("New Title"));
    assert!(content.contains("updated"));
    assert!(content.contains("New body sentence."));
    assert!(!content.contains("Old Title"));
    assert!(!content.contains("Old body sentence."));
}

#[test]
fn given_hash_missing_when_source_stat_matches_then_reindex_restores_hash() {
    let harness = IndexingHarness::new("mdit-indexing-sync-missing-hash");
    harness.write_note("a.md", "# A\nBody\n");

    harness.run_workspace_index();
    harness.clear_doc_hash("a.md");

    assert_eq!(harness.doc_hash("a.md"), None);

    let summary = harness.run_workspace_index();

    assert_eq!(summary.files_processed, 1);
    assert!(harness.doc_hash("a.md").is_some());
}

#[test]
fn given_stale_source_stat_when_content_unchanged_then_reindex_updates_source_stat() {
    let harness = IndexingHarness::new("mdit-indexing-sync-source-stat-refresh");
    harness.write_note("a.md", "# Stable\nBody\n");

    harness.run_workspace_index();

    let original_stat = harness
        .doc_source_stat("a.md")
        .expect("indexed source stat should exist");
    let stale_size = original_stat
        .0
        .map(|value| value.saturating_add(1))
        .or(Some(1));
    let stale_mtime_ns = original_stat
        .1
        .map(|value| value.saturating_add(1))
        .or(Some(1));

    harness.set_doc_source_stat("a.md", stale_size, stale_mtime_ns);

    let summary = harness.run_workspace_index();
    let refreshed_stat = harness
        .doc_source_stat("a.md")
        .expect("refreshed source stat should exist");

    assert_eq!(summary.links_written, 0);
    assert_eq!(summary.links_deleted, 0);
    assert_eq!(refreshed_stat, original_stat);
}
