use std::{path::PathBuf, sync::Arc};

use local_api_core::{CreateNoteInput, LocalApiError, LocalApiErrorKind, SearchNotesInput};
use rmcp::schemars;
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{ServerCapabilities, ServerInfo},
    schemars::JsonSchema,
    tool, tool_handler, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
    },
    ErrorData as McpError, Json, ServerHandler,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone)]
pub struct MditMcpServer {
    db_path: PathBuf,
    tool_router: ToolRouter<Self>,
}

impl MditMcpServer {
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db_path,
            tool_router: Self::tool_router(),
        }
    }
}

#[tool_router]
impl MditMcpServer {
    #[tool(name = "list_vaults", description = "List available vaults.")]
    async fn list_vaults(&self) -> Result<Json<ListVaultsToolOutput>, McpError> {
        let vaults = local_api_core::list_vaults(&self.db_path)
            .map_err(local_api_error_to_mcp)?
            .into_iter()
            .map(|vault| VaultToolSummary {
                id: vault.id,
                workspace_path: vault.workspace_path,
                last_opened_at: vault.last_opened_at,
            })
            .collect();

        Ok(Json(ListVaultsToolOutput { vaults }))
    }

    #[tool(
        name = "create_note",
        description = "Create a markdown note in a vault. Returns NOTE_ALREADY_EXISTS when a duplicate file name exists."
    )]
    async fn create_note(
        &self,
        Parameters(input): Parameters<CreateNoteToolInput>,
    ) -> Result<Json<CreateNoteToolOutput>, McpError> {
        let created = local_api_core::create_note(
            &self.db_path,
            CreateNoteInput {
                vault_id: input.vault_id,
                directory_rel_path: input.directory_rel_path,
                title: input.title,
                content: input.content,
            },
        )
        .map_err(local_api_error_to_mcp)?;

        Ok(Json(CreateNoteToolOutput {
            note: CreatedNoteTool {
                vault_id: created.vault_id,
                workspace_path: created.workspace_path,
                relative_path: created.relative_path,
                absolute_path: created.absolute_path,
            },
        }))
    }

    #[tool(
        name = "search_notes",
        description = "Search markdown notes in a vault."
    )]
    async fn search_notes(
        &self,
        Parameters(input): Parameters<SearchNotesToolInput>,
    ) -> Result<Json<SearchNotesToolOutput>, McpError> {
        let output = local_api_core::search_notes(
            &self.db_path,
            SearchNotesInput {
                vault_id: input.vault_id,
                query: input.query,
                limit: input.limit,
            },
        )
        .map_err(local_api_error_to_mcp)?;

        let results = output
            .results
            .into_iter()
            .map(|entry| SearchResultToolEntry {
                path: entry.path,
                name: entry.name,
                created_at: entry.created_at,
                modified_at: entry.modified_at,
                similarity: entry.similarity,
            })
            .collect();

        Ok(Json(SearchNotesToolOutput { results }))
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for MditMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            instructions: Some(
                "Expose vault listing, markdown note creation, and note search for local automation."
                    .into(),
            ),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            ..Default::default()
        }
    }
}

pub fn build_mcp_service(
    db_path: PathBuf,
) -> StreamableHttpService<MditMcpServer, LocalSessionManager> {
    let session_manager = Arc::new(LocalSessionManager::default());

    StreamableHttpService::new(
        move || Ok(MditMcpServer::new(db_path.clone())),
        session_manager,
        StreamableHttpServerConfig {
            stateful_mode: true,
            sse_keep_alive: None,
            sse_retry: None,
            ..Default::default()
        },
    )
}

fn local_api_error_to_mcp(error: LocalApiError) -> McpError {
    let kind = error.kind();
    let message = error.to_string();
    let data = Some(json!({ "code": error.code() }));

    match kind {
        LocalApiErrorKind::NotFound => McpError::resource_not_found(message, data),
        LocalApiErrorKind::InvalidInput => McpError::invalid_params(message, data),
        LocalApiErrorKind::Conflict => McpError::invalid_request(message, data),
        LocalApiErrorKind::Internal => McpError::internal_error(message, data),
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteToolInput {
    pub vault_id: i64,
    pub directory_rel_path: Option<String>,
    pub title: String,
    pub content: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchNotesToolInput {
    pub vault_id: i64,
    pub query: String,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ListVaultsToolOutput {
    pub vaults: Vec<VaultToolSummary>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct VaultToolSummary {
    pub id: i64,
    pub workspace_path: String,
    pub last_opened_at: String,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct CreateNoteToolOutput {
    pub note: CreatedNoteTool,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct CreatedNoteTool {
    pub vault_id: i64,
    pub workspace_path: String,
    pub relative_path: String,
    pub absolute_path: String,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SearchNotesToolOutput {
    pub results: Vec<SearchResultToolEntry>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SearchResultToolEntry {
    pub path: String,
    pub name: String,
    pub created_at: Option<i64>,
    pub modified_at: Option<i64>,
    pub similarity: f32,
}
