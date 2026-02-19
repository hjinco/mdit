use std::path::PathBuf;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use local_api_core::{CreateNoteInput, LocalApiError, LocalApiErrorKind, SearchNotesInput};
use serde::{Deserialize, Serialize};

use super::mcp_sdk_server::build_mcp_service;

#[derive(Debug, Clone)]
pub struct LocalApiState {
    pub db_path: PathBuf,
}

pub fn build_router(state: LocalApiState) -> Router {
    let mcp_service = build_mcp_service(state.db_path.clone());

    Router::new()
        .route("/healthz", get(healthz_handler))
        .route("/api/v1/vaults", get(list_vaults_handler))
        .route("/api/v1/vaults/{vault_id}/notes", post(create_note_handler))
        .route(
            "/api/v1/vaults/{vault_id}/search",
            post(search_notes_handler),
        )
        .nest_service("/mcp", mcp_service)
        .with_state(state)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ListVaultsResponse {
    vaults: Vec<local_api_core::VaultSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteRequest {
    pub directory_rel_path: Option<String>,
    pub title: String,
    pub content: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateNoteResponse {
    note: local_api_core::CreatedNote,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchNotesRequest {
    pub query: String,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchNotesResponse {
    results: Vec<local_api_core::SearchNoteEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorResponse {
    error: ErrorBody,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    code: String,
    message: String,
}

type ApiResult<T> = Result<Json<T>, (StatusCode, Json<ErrorResponse>)>;

async fn healthz_handler() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn list_vaults_handler(State(state): State<LocalApiState>) -> ApiResult<ListVaultsResponse> {
    match local_api_core::list_vaults(&state.db_path) {
        Ok(vaults) => Ok(Json(ListVaultsResponse { vaults })),
        Err(error) => Err(local_api_error_to_http(error)),
    }
}

async fn create_note_handler(
    Path(vault_id): Path<i64>,
    State(state): State<LocalApiState>,
    Json(request): Json<CreateNoteRequest>,
) -> Result<(StatusCode, Json<CreateNoteResponse>), (StatusCode, Json<ErrorResponse>)> {
    let input = CreateNoteInput {
        vault_id,
        directory_rel_path: request.directory_rel_path,
        title: request.title,
        content: request.content,
    };

    match local_api_core::create_note(&state.db_path, input) {
        Ok(note) => Ok((StatusCode::CREATED, Json(CreateNoteResponse { note }))),
        Err(error) => Err(local_api_error_to_http(error)),
    }
}

async fn search_notes_handler(
    Path(vault_id): Path<i64>,
    State(state): State<LocalApiState>,
    Json(request): Json<SearchNotesRequest>,
) -> ApiResult<SearchNotesResponse> {
    match local_api_core::search_notes(
        &state.db_path,
        SearchNotesInput {
            vault_id,
            query: request.query,
            limit: request.limit,
        },
    ) {
        Ok(output) => Ok(Json(SearchNotesResponse {
            results: output.results,
        })),
        Err(error) => Err(local_api_error_to_http_with_invalid_input_status(
            error,
            StatusCode::BAD_REQUEST,
        )),
    }
}

fn local_api_error_to_http(error: LocalApiError) -> (StatusCode, Json<ErrorResponse>) {
    local_api_error_to_http_with_invalid_input_status(error, StatusCode::UNPROCESSABLE_ENTITY)
}

fn local_api_error_to_http_with_invalid_input_status(
    error: LocalApiError,
    invalid_input_status: StatusCode,
) -> (StatusCode, Json<ErrorResponse>) {
    let status = match error.kind() {
        LocalApiErrorKind::NotFound => StatusCode::NOT_FOUND,
        LocalApiErrorKind::Conflict => StatusCode::CONFLICT,
        LocalApiErrorKind::InvalidInput => invalid_input_status,
        LocalApiErrorKind::Internal => StatusCode::INTERNAL_SERVER_ERROR,
    };

    (
        status,
        Json(ErrorResponse {
            error: ErrorBody {
                code: error.code().to_string(),
                message: error.to_string(),
            },
        }),
    )
}

#[cfg(test)]
pub fn build_mcp_only_router(state: LocalApiState) -> Router {
    let mcp_service = build_mcp_service(state.db_path.clone());
    Router::new()
        .nest_service("/mcp", mcp_service)
        .with_state(state)
}
