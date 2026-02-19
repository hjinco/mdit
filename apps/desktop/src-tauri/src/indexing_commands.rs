use std::path::PathBuf;

use indexing_core::{
    get_backlinks, get_graph_view_data, get_indexing_meta, index_note, index_workspace,
    resolve_wiki_link, search_notes_for_query, BacklinkEntry, GraphViewData, IndexSummary,
    IndexingMeta, ResolveWikiLinkRequest, ResolveWikiLinkResult, SemanticNoteEntry,
};

async fn run_blocking<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn index_workspace_command(
    app_handle: tauri::AppHandle,
    workspace_path: String,
    embedding_provider: Option<String>,
    embedding_model: String,
    force_reindex: bool,
) -> Result<IndexSummary, String> {
    let db_path = crate::appdata::run_app_migrations(&app_handle)?;
    let workspace_path = PathBuf::from(workspace_path);
    let provider = match embedding_provider {
        Some(value) if !value.trim().is_empty() => value,
        _ => "ollama".to_string(),
    };

    run_blocking(move || {
        index_workspace(
            &workspace_path,
            &db_path,
            &provider,
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
    embedding_provider: Option<String>,
    embedding_model: String,
) -> Result<IndexSummary, String> {
    let db_path = crate::appdata::run_app_migrations(&app_handle)?;
    let workspace_path = PathBuf::from(workspace_path);
    let note_path = PathBuf::from(note_path);
    let provider = match embedding_provider {
        Some(value) if !value.trim().is_empty() => value,
        _ => "ollama".to_string(),
    };

    run_blocking(move || {
        index_note(
            &workspace_path,
            &db_path,
            &note_path,
            &provider,
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
    let db_path = crate::appdata::run_app_migrations(&app_handle)?;
    get_indexing_meta(&PathBuf::from(workspace_path), &db_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn search_query_entries_command(
    app_handle: tauri::AppHandle,
    workspace_path: String,
    query: String,
    embedding_provider: String,
    embedding_model: String,
) -> Result<Vec<SemanticNoteEntry>, String> {
    let db_path = crate::appdata::run_app_migrations(&app_handle)?;
    let workspace_path = PathBuf::from(workspace_path);

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
    let db_path = crate::appdata::run_app_migrations(&app_handle)?;
    let workspace_path = PathBuf::from(workspace_path);
    let file_path = PathBuf::from(file_path);

    run_blocking(move || get_backlinks(&workspace_path, &db_path, &file_path)).await
}

#[tauri::command]
pub async fn get_graph_view_data_command(
    app_handle: tauri::AppHandle,
    workspace_path: String,
) -> Result<GraphViewData, String> {
    let db_path = crate::appdata::run_app_migrations(&app_handle)?;
    let workspace_path = PathBuf::from(workspace_path);

    run_blocking(move || get_graph_view_data(&workspace_path, &db_path)).await
}
