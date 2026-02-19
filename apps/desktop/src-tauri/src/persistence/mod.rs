use std::path::{Path, PathBuf};

use anyhow::Context;
use tauri::{AppHandle, Manager, Runtime};

pub fn run_app_migrations_anyhow<R: Runtime>(app_handle: &AppHandle<R>) -> anyhow::Result<PathBuf> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|error| {
        anyhow::anyhow!(
            "Failed to resolve app data directory for appdata database: {}",
            error
        )
    })?;

    app_storage::migrations::run_app_migrations(&app_data_dir).with_context(|| {
        format!(
            "Failed to run appdata database migrations in {}",
            app_data_dir.display()
        )
    })
}

pub fn run_app_migrations<R: Runtime>(app_handle: &AppHandle<R>) -> Result<PathBuf, String> {
    run_app_migrations_anyhow(app_handle).map_err(|error| format!("{error:#}"))
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
