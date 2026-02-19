use std::path::Path;

use app_storage::vault::VaultEmbeddingConfig;
use tauri::{AppHandle, Runtime};

#[tauri::command]
pub fn list_vault_workspaces_command<R: Runtime>(
    app_handle: AppHandle<R>,
) -> Result<Vec<String>, String> {
    let db_path = crate::appdata::run_app_migrations(&app_handle)?;
    app_storage::vault::list_workspaces(&db_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn touch_vault_workspace_command<R: Runtime>(
    app_handle: AppHandle<R>,
    workspace_path: String,
) -> Result<(), String> {
    let db_path = crate::appdata::run_app_migrations(&app_handle)?;
    app_storage::vault::touch_workspace(&db_path, Path::new(&workspace_path))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn remove_vault_workspace_command<R: Runtime>(
    app_handle: AppHandle<R>,
    workspace_path: String,
) -> Result<(), String> {
    let db_path = crate::appdata::run_app_migrations(&app_handle)?;
    app_storage::vault::remove_workspace(&db_path, &workspace_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_vault_embedding_config_command<R: Runtime>(
    app_handle: AppHandle<R>,
    workspace_path: String,
) -> Result<Option<VaultEmbeddingConfig>, String> {
    let db_path = crate::appdata::run_app_migrations(&app_handle)?;
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
    let db_path = crate::appdata::run_app_migrations(&app_handle)?;
    app_storage::vault::set_embedding_config(
        &db_path,
        Path::new(&workspace_path),
        &embedding_provider,
        &embedding_model,
    )
    .map_err(|error| error.to_string())
}
