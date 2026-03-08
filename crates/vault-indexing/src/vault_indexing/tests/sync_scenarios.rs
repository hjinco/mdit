use super::test_support::IndexingHarness;

#[test]
fn given_deleted_preferred_wiki_target_when_reindexing_workspace_then_link_rebinds_to_remaining_target(
) {
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-rebind-target");
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
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-prune-doc");
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
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-content-update");
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
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-missing-hash");
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
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-source-stat-refresh");
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

#[test]
fn given_embedding_model_drift_when_reindexing_with_embeddings_then_doc_rows_and_links_are_preserved(
) {
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-embedding-model-drift");
    harness.write_note("source.md", "[[target]]\n");
    harness.write_note("target.md", "# Target\n");

    harness.run_workspace_index_with_embeddings("test", "model-a");
    let source_doc_id = harness
        .doc_id("source.md")
        .expect("source doc id should exist");
    let target_doc_id = harness
        .doc_id("target.md")
        .expect("target doc id should exist");

    let summary = harness.run_workspace_index_with_embeddings("test", "model-b");

    assert_eq!(summary.docs_deleted, 0);
    assert_eq!(summary.docs_inserted, 0);
    assert_eq!(summary.links_written, 0);
    assert_eq!(summary.links_deleted, 0);
    assert_eq!(harness.doc_id("source.md"), Some(source_doc_id));
    assert_eq!(harness.doc_id("target.md"), Some(target_doc_id));
    assert_eq!(
        harness.doc_embedding_metadata("source.md"),
        Some((Some("model-b".to_string()), Some(3)))
    );
    assert_eq!(harness.link_targets_for("source.md"), vec!["target.md"]);
}

#[test]
fn given_note_reindexed_without_embeddings_then_document_state_updates_without_touching_vectors() {
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-note-document-only");
    harness.write_note("note.md", "Body #project/alpha");

    harness.run_workspace_index_with_embeddings("test", "model-a");
    let original_segment_stats = harness
        .doc_segment_stats("note.md")
        .expect("segment stats should exist");

    harness.write_note("note.md", "Updated body #project/beta");
    let indexed = harness
        .run_note_index("note.md")
        .expect("note indexing should succeed");

    assert_eq!(indexed.embeddings_written, 0);
    assert_eq!(
        harness.doc_embedding_metadata("note.md"),
        Some((Some("model-a".to_string()), Some(3)))
    );
    assert_eq!(
        harness.doc_segment_stats("note.md"),
        Some(original_segment_stats)
    );
    assert_eq!(
        harness.doc_tags("note.md"),
        vec![("project/beta".to_string(), "project/beta".to_string())]
    );
    assert_eq!(
        harness.doc_content("note.md"),
        Some("Updated body #project/beta".to_string())
    );
}

#[test]
fn given_embedding_only_refresh_when_model_changes_then_document_state_stays_stable() {
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-embedding-refresh");
    harness.write_note("source.md", "Body #project [[target]]\n");
    harness.write_note("target.md", "# Target\n");

    harness.run_workspace_index_with_embeddings("test", "model-a");
    harness.install_doc_tag_audit();
    let source_doc_id = harness
        .doc_id("source.md")
        .expect("source doc id should exist");
    let source_content = harness
        .doc_content("source.md")
        .expect("source content should exist");

    let summary = harness.refresh_workspace_embeddings("test", "model-b");

    assert_eq!(summary.docs_deleted, 0);
    assert_eq!(summary.docs_inserted, 0);
    assert_eq!(summary.links_written, 0);
    assert_eq!(summary.links_deleted, 0);
    assert_eq!(harness.doc_id("source.md"), Some(source_doc_id));
    assert_eq!(
        harness.doc_embedding_metadata("source.md"),
        Some((Some("model-b".to_string()), Some(3)))
    );
    assert_eq!(harness.doc_content("source.md"), Some(source_content));
    assert_eq!(harness.link_targets_for("source.md"), vec!["target.md"]);
    assert_eq!(
        harness.doc_tags("source.md"),
        vec![("project".to_string(), "project".to_string())]
    );
    assert!(harness.doc_tag_audit_events().is_empty());
}

#[test]
fn given_unindexed_file_when_refreshing_embeddings_then_it_is_skipped_without_creating_doc() {
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-embedding-refresh-skip");
    harness.write_note("indexed.md", "# Indexed\n");

    harness.run_workspace_index_with_embeddings("test", "model-a");
    harness.write_note("new.md", "# New\n");

    let summary = harness.refresh_workspace_embeddings("test", "model-a");

    assert_eq!(summary.docs_inserted, 0);
    assert_eq!(summary.files_processed, 1);
    assert_eq!(harness.doc_id("new.md"), None);
    assert_eq!(
        harness.doc_embedding_metadata("indexed.md"),
        Some((Some("model-a".to_string()), Some(3)))
    );
}

#[test]
fn given_content_changed_when_refreshing_embeddings_then_vectors_update_without_document_refresh() {
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-embedding-content-drift");
    harness.write_note("note.md", "Old body");

    harness.run_workspace_index_with_embeddings("test", "model-a");
    harness.write_note("note.md", "New body");

    let summary = harness.refresh_workspace_embeddings("test", "model-a");

    assert!(summary.embeddings_written > 0);
    assert_eq!(harness.doc_content("note.md"), Some("Old body".to_string()));
    assert_eq!(
        harness.doc_embedding_metadata("note.md"),
        Some((Some("model-a".to_string()), Some(3)))
    );
}

#[test]
fn given_unrelated_doc_insert_when_reindexing_then_unrelated_wiki_sources_are_not_refreshed() {
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-unrelated-insert");
    harness.write_note("source.md", "[[target]]\n");
    harness.write_note("target.md", "# Target\n");

    harness.run_workspace_index();
    harness.write_note("unrelated.md", "# Unrelated\n");

    let summary = harness.run_workspace_index();

    assert_eq!(summary.docs_inserted, 1);
    assert_eq!(summary.links_deleted, 0);
    assert_eq!(summary.links_written, 0);
    assert_eq!(harness.link_targets_for("source.md"), vec!["target.md"]);
}

#[test]
fn given_inserted_doc_matches_unresolved_markdown_target_path_then_target_doc_id_is_bound_without_source_refresh(
) {
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-markdown-bind");
    harness.write_note("source.md", "[Go](new.md)\n");

    harness.run_workspace_index();
    let before = harness.link_rows_for("source.md");
    assert_eq!(before, vec![("new.md".to_string(), None)]);

    harness.write_note("new.md", "# New\n");
    let summary = harness.run_workspace_index();

    let inserted_doc_id = harness
        .doc_id("new.md")
        .expect("inserted doc id should exist");
    let after = harness.link_rows_for("source.md");

    assert_eq!(summary.docs_inserted, 1);
    assert_eq!(summary.links_deleted, 0);
    assert_eq!(summary.links_written, 0);
    assert_eq!(after, vec![("new.md".to_string(), Some(inserted_doc_id))]);
}

#[test]
fn given_wiki_basename_dependency_when_target_deleted_then_only_dependent_sources_rebind() {
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-dependency-target-delete");
    harness.write_note("source-note.md", "[[note]]\n");
    harness.write_note("source-other.md", "[[other]]\n");
    harness.write_note("note.md", "# Note\n");
    harness.write_note("other.md", "# Other\n");

    harness.run_workspace_index();
    harness.remove_note("note.md");

    let summary = harness.run_workspace_index();

    assert_eq!(summary.docs_deleted, 1);
    assert_eq!(summary.links_deleted, 1);
    assert_eq!(summary.links_written, 1);
    assert_eq!(harness.link_targets_for("source-note.md"), vec!["note.md"]);
    assert_eq!(
        harness.link_targets_for("source-other.md"),
        vec!["other.md"]
    );
}

#[test]
fn given_wiki_path_suffix_dependency_when_target_deleted_then_only_dependent_sources_rebind() {
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-query-key-path-delete");
    harness.write_note("source-team.md", "[[team/note]]\n");
    harness.write_note("source-other.md", "[[other/note]]\n");
    harness.write_note("docs/team/note.md", "# Team Note\n");
    harness.write_note("archive/other/note.md", "# Other Note\n");

    harness.run_workspace_index();
    harness.remove_note("docs/team/note.md");

    let summary = harness.run_workspace_index();

    assert_eq!(summary.docs_deleted, 1);
    assert_eq!(summary.links_deleted, 1);
    assert_eq!(summary.links_written, 1);
    assert_eq!(
        harness.link_targets_for("source-team.md"),
        vec!["team/note.md"]
    );
    assert_eq!(
        harness.link_targets_for("source-other.md"),
        vec!["archive/other/note.md"]
    );
}

#[test]
fn given_source_links_changed_when_reindexing_then_wiki_link_ref_rows_are_replaced() {
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-wiki-ref-replace");
    harness.write_note("source.md", "[[old]]\n");

    harness.run_workspace_index();
    assert_eq!(harness.wiki_ref_keys_for("source.md"), vec!["old"]);

    harness.write_note("source.md", "[[new]]\n");
    harness.run_workspace_index();

    assert_eq!(harness.wiki_ref_keys_for("source.md"), vec!["new"]);
}

#[test]
fn given_source_doc_deleted_then_wiki_link_ref_rows_are_cascaded() {
    let harness = IndexingHarness::new("mdit-vault-indexing-sync-wiki-ref-cascade");
    harness.write_note("source.md", "[[note]]\n");
    harness.write_note("note.md", "# Note\n");

    harness.run_workspace_index();
    assert_eq!(harness.wiki_ref_keys_for("source.md"), vec!["note"]);

    harness.remove_note("source.md");
    let summary = harness.run_workspace_index();

    assert_eq!(summary.docs_deleted, 1);
    assert!(harness.wiki_ref_keys_for("source.md").is_empty());
}
