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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_keyring::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![move_to_trash, move_many_to_trash])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
