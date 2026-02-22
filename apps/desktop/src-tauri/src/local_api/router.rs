use std::{
    future::Future,
    path::PathBuf,
    pin::Pin,
    sync::{Arc, RwLock},
    task::{Context, Poll},
};

use axum::{
    extract::{Path, Request, State},
    http::{header, HeaderMap, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use local_api_core::{CreateNoteInput, LocalApiError, LocalApiErrorKind, SearchNotesInput};
use serde::{Deserialize, Serialize};
use tower::{Layer, Service};

use super::mcp_sdk_server::build_mcp_service;

#[derive(Debug, Clone)]
pub struct LocalApiState {
    pub db_path: PathBuf,
    pub auth_token: Arc<RwLock<String>>,
}

pub fn build_router(state: LocalApiState) -> Router {
    let protected_routes =
        build_protected_routes(state.db_path.clone(), Arc::clone(&state.auth_token));

    Router::new()
        .route("/healthz", get(healthz_handler))
        .merge(protected_routes)
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

fn build_protected_routes(
    db_path: PathBuf,
    auth_token: Arc<RwLock<String>>,
) -> Router<LocalApiState> {
    let mcp_service = build_mcp_service(db_path);

    Router::new()
        .route("/api/v1/vaults", get(list_vaults_handler))
        .route("/api/v1/vaults/{vault_id}/notes", post(create_note_handler))
        .route(
            "/api/v1/vaults/{vault_id}/search",
            post(search_notes_handler),
        )
        .nest_service("/mcp", mcp_service)
        .route_layer(AuthLayer::new(auth_token))
}

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

#[derive(Clone)]
struct AuthLayer {
    auth_token: Arc<RwLock<String>>,
}

impl AuthLayer {
    fn new(auth_token: Arc<RwLock<String>>) -> Self {
        Self { auth_token }
    }
}

impl<S> Layer<S> for AuthLayer {
    type Service = AuthService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        AuthService {
            inner,
            auth_token: Arc::clone(&self.auth_token),
        }
    }
}

#[derive(Clone)]
struct AuthService<S> {
    inner: S,
    auth_token: Arc<RwLock<String>>,
}

impl<S> Service<Request> for AuthService<S>
where
    S: Service<Request, Response = Response> + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = Response;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, request: Request) -> Self::Future {
        let configured_token = match self.auth_token.read() {
            Ok(token) => token.clone(),
            Err(error) => {
                let response = internal_auth_error_to_http(format!(
                    "Failed to lock local API auth token: {error}"
                ))
                .into_response();
                return Box::pin(async move { Ok(response) });
            }
        };

        if request_has_valid_token(&request, &configured_token) {
            let future = self.inner.call(request);
            return Box::pin(async move { future.await });
        }

        let response = unauthorized_error_to_http().into_response();
        Box::pin(async move { Ok(response) })
    }
}

fn request_has_valid_token(request: &Request, configured_token: &str) -> bool {
    if configured_token.is_empty() {
        return false;
    }

    let provided_token = extract_bearer_token(request.headers()).or_else(|| {
        if request.uri().path().starts_with("/mcp") {
            extract_token_from_query(request.uri())
        } else {
            None
        }
    });

    matches!(provided_token, Some(token) if token == configured_token)
}

fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    let auth_header = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let (scheme, token) = auth_header.split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("bearer") {
        return None;
    }

    let normalized = token.trim();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized.to_string())
    }
}

fn extract_token_from_query(uri: &Uri) -> Option<String> {
    let query = uri.query()?;

    for part in query.split('&') {
        let mut segments = part.splitn(2, '=');
        let key = segments.next().unwrap_or_default();
        if key != "token" {
            continue;
        }

        let raw_value = segments.next().unwrap_or_default();
        if raw_value.is_empty() {
            return None;
        }

        let decoded = urlencoding::decode(raw_value).ok()?;
        let normalized = decoded.trim();
        if normalized.is_empty() {
            return None;
        }

        return Some(normalized.to_string());
    }

    None
}

fn unauthorized_error_to_http() -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse {
            error: ErrorBody {
                code: "UNAUTHORIZED".to_string(),
                message: "Missing or invalid local API token.".to_string(),
            },
        }),
    )
}

fn internal_auth_error_to_http(message: String) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            error: ErrorBody {
                code: "AUTH_STATE_ERROR".to_string(),
                message,
            },
        }),
    )
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
    let auth_token = Arc::clone(&state.auth_token);
    let mcp_service = build_mcp_service(state.db_path.clone());
    Router::new()
        .nest_service("/mcp", mcp_service)
        .route_layer(AuthLayer::new(auth_token))
        .with_state(state)
}
