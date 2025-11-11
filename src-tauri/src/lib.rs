mod migrations;

use std::fs::File;
use std::io::Read;
use trash;

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
        .invoke_handler(tauri::generate_handler![
            move_to_trash,
            move_many_to_trash,
            get_note_preview,
            apply_workspace_migrations
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
