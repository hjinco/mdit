use std::path::Path;

use tauri::AppHandle;

#[tauri::command]
pub fn apply_appdata_migrations(
    app_handle: AppHandle,
    workspace_path: Option<String>,
) -> Result<(), String> {
    crate::appdata::run_app_migrations(&app_handle)?;

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
