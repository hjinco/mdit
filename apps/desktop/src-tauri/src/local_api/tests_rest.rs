use std::{fs, path::Path};

use axum::{
    body::{to_bytes, Body},
    http::{header, Request, StatusCode},
};
use serde_json::{json, Value};
use tower::ServiceExt;

use super::{
    router::{build_router, LocalApiState},
    test_support::{seed_search_fixture, Harness},
};

#[tokio::test]
async fn get_vaults_returns_workspace_list() {
    let harness = Harness::new("local-api-rest-vaults");

    let response = app(&harness)
        .oneshot(
            Request::builder()
                .uri("/api/v1/vaults")
                .method("GET")
                .body(Body::empty())
                .expect("failed to build request"),
        )
        .await
        .expect("request should succeed");

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("failed to read response body");
    let payload: Value = serde_json::from_slice(&body).expect("response should be json");

    let vaults = payload
        .get("vaults")
        .and_then(Value::as_array)
        .expect("vaults array should exist");
    assert_eq!(vaults.len(), 1);
    assert_eq!(
        vaults[0].get("id").and_then(Value::as_i64),
        Some(harness.vault_id)
    );
    assert_eq!(
        vaults[0].get("workspacePath").and_then(Value::as_str),
        Some(
            normalize_path(
                &fs::canonicalize(&harness.workspace_path).expect("workspace should canonicalize"),
            )
            .as_str(),
        )
    );
}

#[tokio::test]
async fn create_note_returns_conflict_when_file_already_exists() {
    let harness = Harness::new("local-api-rest-conflict");
    let existing_path = harness.workspace_path.join("Daily.md");
    fs::write(&existing_path, "# existing").expect("failed to create existing note");

    let response = app(&harness)
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/vaults/{}/notes", harness.vault_id))
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    json!({
                        "title": "Daily",
                        "content": "# new"
                    })
                    .to_string(),
                ))
                .expect("failed to build request"),
        )
        .await
        .expect("request should succeed");

    assert_eq!(response.status(), StatusCode::CONFLICT);
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("failed to read response body");
    let payload: Value = serde_json::from_slice(&body).expect("response should be json");

    assert_eq!(
        payload
            .get("error")
            .and_then(|value| value.get("code"))
            .and_then(Value::as_str),
        Some("NOTE_ALREADY_EXISTS")
    );
}

#[tokio::test]
async fn search_notes_returns_results() {
    let harness = Harness::new("local-api-rest-search-success");
    seed_search_fixture(&harness);

    let response = app(&harness)
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/vaults/{}/search", harness.vault_id))
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    json!({
                        "query": "nebula",
                        "limit": 1
                    })
                    .to_string(),
                ))
                .expect("failed to build request"),
        )
        .await
        .expect("request should succeed");

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("failed to read response body");
    let payload: Value = serde_json::from_slice(&body).expect("response should be json");

    let results = payload
        .get("results")
        .and_then(Value::as_array)
        .expect("results array should exist");
    assert_eq!(results.len(), 1);
    assert!(results[0]
        .get("path")
        .and_then(Value::as_str)
        .expect("path should exist")
        .ends_with(".md"));
    assert!(results[0]
        .get("name")
        .and_then(Value::as_str)
        .expect("name should exist")
        .ends_with(".md"));
    assert!(results[0]
        .get("similarity")
        .and_then(Value::as_f64)
        .is_some());
}

#[tokio::test]
async fn search_notes_returns_bad_request_for_empty_query() {
    let harness = Harness::new("local-api-rest-search-empty-query");

    let response = app(&harness)
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/vaults/{}/search", harness.vault_id))
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    json!({
                        "query": "   "
                    })
                    .to_string(),
                ))
                .expect("failed to build request"),
        )
        .await
        .expect("request should succeed");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("failed to read response body");
    let payload: Value = serde_json::from_slice(&body).expect("response should be json");

    assert_eq!(
        payload
            .get("error")
            .and_then(|value| value.get("code"))
            .and_then(Value::as_str),
        Some("INVALID_SEARCH_QUERY")
    );
}

#[tokio::test]
async fn search_notes_returns_not_found_for_unknown_vault() {
    let harness = Harness::new("local-api-rest-search-unknown-vault");

    let response = app(&harness)
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/vaults/{}/search", harness.vault_id + 1000))
                .method("POST")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    json!({
                        "query": "nebula"
                    })
                    .to_string(),
                ))
                .expect("failed to build request"),
        )
        .await
        .expect("request should succeed");

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("failed to read response body");
    let payload: Value = serde_json::from_slice(&body).expect("response should be json");

    assert_eq!(
        payload
            .get("error")
            .and_then(|value| value.get("code"))
            .and_then(Value::as_str),
        Some("VAULT_NOT_FOUND")
    );
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn app(harness: &Harness) -> axum::Router {
    build_router(LocalApiState {
        db_path: harness.db_path.clone(),
    })
}
