use std::path::{Path, PathBuf};

use app_storage::vault::VaultEmbeddingConfig;
use indexing_core::{
    get_backlinks, get_graph_view_data, get_indexing_meta, index_note, index_workspace,
    resolve_wiki_link, search_notes_for_query, BacklinkEntry, GraphViewData, IndexSummary,
    IndexingMeta, ResolveWikiLinkRequest, ResolveWikiLinkResult, SemanticNoteEntry,
};
use tauri::{AppHandle, Runtime};

async fn run_blocking<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

fn resolve_embedding_for_workspace(
    db_path: &Path,
    workspace_path: &Path,
) -> Result<(String, String), String> {
    let embedding_config = app_storage::vault::get_embedding_config(db_path, workspace_path)
        .map_err(|error| error.to_string())?;

    match embedding_config {
        Some(config) => Ok((config.embedding_provider, config.embedding_model)),
        None => Ok((String::new(), String::new())),
    }
}

#[tauri::command]
pub async fn index_workspace_command(
    app_handle: tauri::AppHandle,
    workspace_path: String,
    force_reindex: bool,
) -> Result<IndexSummary, String> {
    let db_path = crate::persistence::run_app_migrations(&app_handle)?;
    let workspace_path = PathBuf::from(workspace_path);
    let (embedding_provider, embedding_model) =
        resolve_embedding_for_workspace(&db_path, &workspace_path)?;

    run_blocking(move || {
        index_workspace(
            &workspace_path,
            &db_path,
            &embedding_provider,
            &embedding_model,
            force_reindex,
        )
    })
    .await
}

#[tauri::command]
pub async fn index_note_command(
    app_handle: tauri::AppHandle,
    workspace_path: String,
    note_path: String,
    include_embeddings: Option<bool>,
) -> Result<IndexSummary, String> {
    let db_path = crate::persistence::run_app_migrations(&app_handle)?;
    let workspace_path = PathBuf::from(workspace_path);
    let note_path = PathBuf::from(note_path);
    let should_include_embeddings = include_embeddings.unwrap_or(true);
    let (embedding_provider, embedding_model) = if should_include_embeddings {
        resolve_embedding_for_workspace(&db_path, &workspace_path)?
    } else {
        (String::new(), String::new())
    };

    run_blocking(move || {
        index_note(
            &workspace_path,
            &db_path,
            &note_path,
            &embedding_provider,
            &embedding_model,
        )
    })
    .await
}

#[tauri::command]
pub fn get_indexing_meta_command(
    app_handle: tauri::AppHandle,
    workspace_path: String,
) -> Result<IndexingMeta, String> {
    let db_path = crate::persistence::run_app_migrations(&app_handle)?;
    get_indexing_meta(&PathBuf::from(workspace_path), &db_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn search_query_entries_command(
    app_handle: tauri::AppHandle,
    workspace_path: String,
    query: String,
) -> Result<Vec<SemanticNoteEntry>, String> {
    let db_path = crate::persistence::run_app_migrations(&app_handle)?;
    let workspace_path = PathBuf::from(workspace_path);
    let (embedding_provider, embedding_model) =
        resolve_embedding_for_workspace(&db_path, &workspace_path)?;

    run_blocking(move || {
        search_notes_for_query(
            &workspace_path,
            &db_path,
            &query,
            &embedding_provider,
            &embedding_model,
        )
    })
    .await
}

#[tauri::command]
pub async fn resolve_wiki_link_command(
    workspace_path: String,
    current_note_path: Option<String>,
    raw_target: String,
    workspace_rel_paths: Option<Vec<String>>,
) -> Result<ResolveWikiLinkResult, String> {
    let request = ResolveWikiLinkRequest {
        workspace_path,
        current_note_path,
        raw_target,
        workspace_rel_paths,
    };

    run_blocking(move || resolve_wiki_link(request)).await
}

#[tauri::command]
pub async fn get_backlinks_command(
    app_handle: tauri::AppHandle,
    workspace_path: String,
    file_path: String,
) -> Result<Vec<BacklinkEntry>, String> {
    let db_path = crate::persistence::run_app_migrations(&app_handle)?;
    let workspace_path = PathBuf::from(workspace_path);
    let file_path = PathBuf::from(file_path);

    run_blocking(move || get_backlinks(&workspace_path, &db_path, &file_path)).await
}

#[tauri::command]
pub async fn get_graph_view_data_command(
    app_handle: tauri::AppHandle,
    workspace_path: String,
) -> Result<GraphViewData, String> {
    let db_path = crate::persistence::run_app_migrations(&app_handle)?;
    let workspace_path = PathBuf::from(workspace_path);

    run_blocking(move || get_graph_view_data(&workspace_path, &db_path)).await
}

#[tauri::command]
pub fn list_vault_workspaces_command<R: Runtime>(
    app_handle: AppHandle<R>,
) -> Result<Vec<String>, String> {
    let db_path = crate::persistence::run_app_migrations(&app_handle)?;
    app_storage::vault::list_workspaces(&db_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn touch_vault_workspace_command<R: Runtime>(
    app_handle: AppHandle<R>,
    workspace_path: String,
) -> Result<(), String> {
    let db_path = crate::persistence::run_app_migrations(&app_handle)?;
    app_storage::vault::touch_workspace(&db_path, Path::new(&workspace_path))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn remove_vault_workspace_command<R: Runtime>(
    app_handle: AppHandle<R>,
    workspace_path: String,
) -> Result<(), String> {
    let db_path = crate::persistence::run_app_migrations(&app_handle)?;
    app_storage::vault::remove_workspace(&db_path, &workspace_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_vault_embedding_config_command<R: Runtime>(
    app_handle: AppHandle<R>,
    workspace_path: String,
) -> Result<Option<VaultEmbeddingConfig>, String> {
    let db_path = crate::persistence::run_app_migrations(&app_handle)?;
    app_storage::vault::get_embedding_config(&db_path, Path::new(&workspace_path))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_vault_embedding_config_command<R: Runtime>(
    app_handle: AppHandle<R>,
    workspace_path: String,
    embedding_provider: String,
    embedding_model: String,
) -> Result<(), String> {
    let db_path = crate::persistence::run_app_migrations(&app_handle)?;
    app_storage::vault::set_embedding_config(
        &db_path,
        Path::new(&workspace_path),
        &embedding_provider,
        &embedding_model,
    )
    .map_err(|error| error.to_string())
}
