use super::test_support::IndexingHarness;

#[test]
fn given_workspace_with_three_notes_when_indexing_then_meta_counts_all_notes() {
    let harness = IndexingHarness::new("mdit-indexing-workspace-count");
    harness.write_note("a.md", "[[b]]\n");
    harness.write_note("b.md", "# B\n");
    harness.write_note("c.md", "# C\n");

    let summary = harness.run_workspace_index();

    assert_eq!(summary.files_discovered, 3);
    assert_eq!(summary.files_processed, 3);
    assert_eq!(harness.meta().indexed_doc_count, 3);
}

#[test]
fn given_unchanged_workspace_when_indexing_twice_then_second_run_does_not_refresh_links() {
    let harness = IndexingHarness::new("mdit-indexing-workspace-idempotent");
    harness.write_note("a.md", "[[b]]\n");
    harness.write_note("b.md", "# B\n");

    harness.run_workspace_index();
    let second_summary = harness.run_workspace_index();

    assert_eq!(second_summary.links_written, 0);
    assert_eq!(second_summary.links_deleted, 0);
}

#[test]
fn given_note_link_changes_when_reindexing_workspace_then_only_that_note_links_are_replaced() {
    let harness = IndexingHarness::new("mdit-indexing-workspace-link-replace");
    harness.write_note("a.md", "[[b]]\n");
    harness.write_note("b.md", "# B\n");
    harness.write_note("c.md", "# C\n");

    harness.run_workspace_index();
    harness.write_note("a.md", "[[c]]\n");

    let summary = harness.run_workspace_index();

    assert_eq!(summary.links_deleted, 1);
    assert_eq!(summary.links_written, 1);
    assert_eq!(harness.link_targets_for("a.md"), vec!["c.md"]);
    assert_eq!(harness.meta().indexed_doc_count, 3);
}

#[test]
fn given_unresolved_wiki_link_when_target_note_is_added_then_links_are_refreshed() {
    let harness = IndexingHarness::new("mdit-indexing-workspace-unresolved");
    harness.write_note("a.md", "[[new-doc]]\n");

    harness.run_workspace_index();
    harness.write_note("new-doc.md", "# New Doc\n");

    let summary = harness.run_workspace_index();

    assert_eq!(summary.docs_inserted, 1);
    assert_eq!(summary.links_deleted, 1);
    assert_eq!(summary.links_written, 1);
    assert_eq!(harness.link_targets_for("a.md"), vec!["new-doc.md"]);
}
