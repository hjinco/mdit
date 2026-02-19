use std::path::Path;

use super::super::search::{
    materialize_ranked_entries, rank_score_inputs, search_notes_for_query, RankedCandidate,
    ScoreInput,
};
use super::test_support::IndexingHarness;

#[test]
fn given_vector_and_bm25_scores_when_ranking_then_semantic_weight_dominates() {
    let ranked = rank_score_inputs(vec![
        ScoreInput {
            rel_path: "semantic.md".to_string(),
            bm25: Some(0.1),
            vector: Some(0.9),
        },
        ScoreInput {
            rel_path: "keyword.md".to_string(),
            bm25: Some(1.3),
            vector: Some(0.2),
        },
    ]);

    assert_eq!(ranked.len(), 2);
    assert_eq!(ranked[0].rel_path, "semantic.md");
    assert!(ranked[0].similarity > ranked[1].similarity);
}

#[test]
fn given_bm25_only_scores_when_ranking_then_bm25_only_ranking_is_used() {
    let ranked = rank_score_inputs(vec![
        ScoreInput {
            rel_path: "high.md".to_string(),
            bm25: Some(0.9),
            vector: None,
        },
        ScoreInput {
            rel_path: "low.md".to_string(),
            bm25: Some(0.1),
            vector: None,
        },
    ]);

    assert_eq!(ranked.len(), 1);
    assert_eq!(ranked[0].rel_path, "high.md");
}

#[test]
fn given_small_or_missing_files_when_materializing_ranked_candidates_then_only_real_notes_remain() {
    let harness = IndexingHarness::new("mdit-indexing-search-materialize");
    harness.write_note("tiny.md", "too small");
    harness.write_note("full.md", &"content ".repeat(80));

    let entries = materialize_ranked_entries(
        harness.root(),
        vec![
            RankedCandidate {
                rel_path: "tiny.md".to_string(),
                similarity: 0.9,
            },
            RankedCandidate {
                rel_path: "missing.md".to_string(),
                similarity: 0.8,
            },
            RankedCandidate {
                rel_path: "full.md".to_string(),
                similarity: 0.7,
            },
        ],
    )
    .expect("materialization should succeed");

    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "full.md");
}

#[test]
fn given_empty_query_or_missing_embedding_inputs_when_searching_then_it_returns_without_errors() {
    let harness = IndexingHarness::new("mdit-indexing-search-guards");

    let empty_result = search_notes_for_query(
        harness.root(),
        Path::new("/tmp/non-existent-search.sqlite"),
        "   ",
        "",
        "",
    )
    .expect("empty query should return an empty result");
    assert!(empty_result.is_empty());

    let missing_provider =
        search_notes_for_query(harness.root(), harness.db_path(), "query", "", "model")
            .expect("missing provider should fall back to BM25-only search");
    assert!(missing_provider.is_empty());

    let missing_model =
        search_notes_for_query(harness.root(), harness.db_path(), "query", "ollama", "")
            .expect("missing model should fall back to BM25-only search");
    assert!(missing_model.is_empty());
}
