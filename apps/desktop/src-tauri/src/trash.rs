#[tauri::command]
pub fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(path).map_err(|e| format!("Failed to delete file: {}", e))
}

#[tauri::command]
pub fn move_many_to_trash(paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }

    trash::delete_all(paths).map_err(|e| format!("Failed to delete files: {}", e))
}
