use std::path::{Path, PathBuf};

#[tauri::command]
pub async fn get_file_frontmatter(path: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || mdit_note::read_frontmatter(&PathBuf::from(path)))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn get_note_preview(path: String) -> Result<String, String> {
    mdit_note::get_note_preview(Path::new(&path))
}
