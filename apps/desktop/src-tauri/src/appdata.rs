use std::path::PathBuf;

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
