use super::super::get_graph_view_data;
use super::test_support::IndexingHarness;

#[test]
fn given_resolved_and_unresolved_links_when_loading_graph_then_both_node_types_are_returned() {
    let harness = IndexingHarness::new("mdit-indexing-graph-resolved-unresolved");
    harness.write_note(
        "source.md",
        "[[target]]\n[[target]]\n[[missing]]\n[[missing]]\n",
    );
    harness.write_note("target.md", "# Target\n");

    harness.run_workspace_index();

    let graph = get_graph_view_data(harness.root(), harness.db_path())
        .expect("graph data should be loadable after indexing");
    let source_doc_id = harness.doc_id("source.md").expect("missing source doc id");
    let target_doc_id = harness.doc_id("target.md").expect("missing target doc id");

    assert!(graph
        .nodes
        .iter()
        .any(|node| node.id == format!("doc:{source_doc_id}")));
    assert!(graph
        .nodes
        .iter()
        .any(|node| node.id == format!("doc:{target_doc_id}")));
    assert!(graph
        .nodes
        .iter()
        .any(|node| node.id == "unresolved:missing.md" && node.unresolved));
    assert_eq!(
        graph.edges.len(),
        2,
        "duplicate links should be deduplicated"
    );
    assert_eq!(graph.edges.iter().filter(|edge| edge.unresolved).count(), 1);
}

#[test]
fn given_vault_not_indexed_when_loading_graph_then_it_returns_empty_data() {
    let harness = IndexingHarness::new("mdit-indexing-graph-empty");
    harness.write_note("orphan.md", "# Orphan\n");

    let graph = get_graph_view_data(harness.root(), harness.db_path())
        .expect("graph query should succeed even without vault row");

    assert!(graph.nodes.is_empty());
    assert!(graph.edges.is_empty());
}

#[test]
fn given_duplicate_edges_when_loading_graph_then_each_pair_is_returned_once() {
    let harness = IndexingHarness::new("mdit-indexing-graph-dedupe");
    harness.write_note(
        "source.md",
        "[[target]]\n[[target]]\n[Alias](target.md)\n[[target|Other]]\n",
    );
    harness.write_note("target.md", "# Target\n");

    harness.run_workspace_index();

    let graph =
        get_graph_view_data(harness.root(), harness.db_path()).expect("graph query should succeed");

    let source_doc_id = harness.doc_id("source.md").expect("missing source doc id");
    let target_doc_id = harness.doc_id("target.md").expect("missing target doc id");
    let source_node = format!("doc:{source_doc_id}");
    let target_node = format!("doc:{target_doc_id}");

    let matching_edges = graph
        .edges
        .iter()
        .filter(|edge| edge.source == source_node && edge.target == target_node)
        .count();
    assert_eq!(matching_edges, 1);
}
