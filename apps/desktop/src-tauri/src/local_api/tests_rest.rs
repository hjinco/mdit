use std::{fs, path::Path};

use axum::{
    body::{to_bytes, Body},
    http::{header, Request, StatusCode},
};
use serde_json::{json, Value};
use tower::ServiceExt;

use super::{
    router::{build_router, LocalApiState},
    test_support::Harness,
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

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn app(harness: &Harness) -> axum::Router {
    build_router(LocalApiState {
        db_path: harness.db_path.clone(),
    })
}
