mod file_opener;
mod image_processing;
mod indexing;
mod migrations;

use std::fs;
use std::fs::File;
use std::io::Read;
use tauri::Manager;
use tauri_plugin_window_state::Builder as WindowStateBuilder;
use trash;

#[tauri::command]
fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(path).map_err(|e| format!("Failed to delete file: {}", e))
}

#[tauri::command]
fn move_many_to_trash(paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }

    trash::delete_all(paths).map_err(|e| format!("Failed to delete files: {}", e))
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
        indexing::search_notes_for_query(
            &workspace_path,
            &query,
            &embedding_provider,
            &embedding_model,
        )
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn copy_file(source_path: String, destination_path: String) -> Result<(), String> {
    fs::copy(&source_path, &destination_path)
        .map_err(|e| format!("Failed to copy file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_image_properties(path: String) -> Result<image_processing::ImageProperties, String> {
    image_processing::get_image_properties(&path)
}

#[tauri::command]
async fn edit_image(
    input_path: String,
    options: image_processing::ImageEditOptions,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        image_processing::edit_image(&input_path, options)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = file_opener::AppState::default();
    file_opener::initialize_opened_files(&app_state);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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
            file_opener::get_opened_files,
            copy_file,
            move_to_trash,
            move_many_to_trash,
            get_note_preview,
            apply_workspace_migrations,
            index_workspace,
            get_indexing_meta,
            search_query_entries,
            get_image_properties,
            edit_image
        ])
        .manage(app_state)
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        match event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                // Show main window if it exists, otherwise create it
                if let Some(main_window) = app_handle.get_webview_window("main") {
                    let _ = main_window.show();
                    let _ = main_window.set_focus();
                }
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                file_opener::handle_opened_event(app_handle, urls);
            }
            _ => {}
        }
    });
}
