use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

pub fn run_app_migrations<R: Runtime>(app_handle: &AppHandle<R>) -> Result<PathBuf, String> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|error| {
        format!(
            "Failed to resolve app data directory for appdata database: {}",
            error
        )
    })?;

    app_storage::migrations::run_app_migrations(&app_data_dir).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn apply_appdata_migrations(
    app_handle: AppHandle,
    workspace_path: Option<String>,
) -> Result<(), String> {
    run_app_migrations(&app_handle)?;

    if let Some(workspace_path) = workspace_path {
        let trimmed = workspace_path.trim();
        if !trimmed.is_empty() {
            if let Err(error) =
                app_storage::migrations::cleanup_legacy_workspace_index_db(Path::new(trimmed))
            {
                eprintln!(
                    "Failed to clean up legacy workspace DB at {}: {}",
                    trimmed, error
                );
            }
        }
    }

    Ok(())
}
