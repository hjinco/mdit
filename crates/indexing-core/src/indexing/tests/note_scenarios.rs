use std::path::PathBuf;

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
