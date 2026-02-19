use std::path::PathBuf;

#[tauri::command]
pub async fn get_file_frontmatter(path: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || note_core::read_frontmatter(&PathBuf::from(path)))
        .await
        .map_err(|error| error.to_string())?
}
