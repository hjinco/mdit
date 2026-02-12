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
