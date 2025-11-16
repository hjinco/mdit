mod indexing;
mod migrations;

use std::fs::File;
use std::io::Read;
use trash;
use tauri_plugin_window_state::Builder as WindowStateBuilder;

#[tauri::command]
fn move_to_trash(path: String) {
    trash::delete(path).unwrap();
}

#[tauri::command]
fn move_many_to_trash(paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }

    trash::delete_all(paths).unwrap();
}

#[tauri::command]
fn get_note_preview(path: String) -> Result<String, String> {
    const PREVIEW_BYTES: usize = 300;

    let mut file = File::open(&path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut buffer = vec![0u8; PREVIEW_BYTES];

    match file.read(&mut buffer) {
        Ok(bytes_read) => {
            if bytes_read == 0 {
                return Ok(String::new());
            }
            buffer.truncate(bytes_read);
            Ok(String::from_utf8_lossy(&buffer).to_string())
        }
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

#[tauri::command]
fn apply_workspace_migrations(workspace_path: String) -> Result<(), String> {
    use std::path::PathBuf;

    let workspace_path = PathBuf::from(workspace_path);
    migrations::apply_workspace_migrations(&workspace_path)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn index_workspace(
    workspace_path: String,
    embedding_provider: Option<String>,
    embedding_model: String,
    force_reindex: bool,
) -> Result<indexing::IndexSummary, String> {
    use std::path::PathBuf;

    let workspace_path = PathBuf::from(workspace_path);
    let provider = embedding_provider.unwrap_or_else(|| "ollama".to_string());
    let model = embedding_model;

    tauri::async_runtime::spawn_blocking(move || {
        indexing::index_workspace(&workspace_path, &provider, &model, force_reindex)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_indexing_meta(workspace_path: String) -> Result<indexing::IndexingMeta, String> {
    use std::path::PathBuf;

    let workspace_path = PathBuf::from(workspace_path);
    indexing::get_indexing_meta(&workspace_path).map_err(|error| error.to_string())
}

#[tauri::command]
async fn search_query_entries(
    workspace_path: String,
    query: String,
    embedding_provider: String,
    embedding_model: String,
) -> Result<Vec<indexing::SemanticNoteEntry>, String> {
    use std::path::PathBuf;

    let workspace_path = PathBuf::from(workspace_path);

    tauri::async_runtime::spawn_blocking(move || {
        indexing::search_notes_for_query(&workspace_path, &query, &embedding_provider, &embedding_model)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_keyring::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard::init())
        .plugin(WindowStateBuilder::default().build())
        .invoke_handler(tauri::generate_handler![
            move_to_trash,
            move_many_to_trash,
            get_note_preview,
            apply_workspace_migrations,
            index_workspace,
            get_indexing_meta,
            search_query_entries
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
