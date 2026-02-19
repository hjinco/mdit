use std::path::Path;

#[tauri::command]
pub fn get_note_preview(path: String) -> Result<String, String> {
    note_core::get_note_preview(Path::new(&path))
}
