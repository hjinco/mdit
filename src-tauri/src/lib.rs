mod copy;
mod database;
mod file_opener;
mod image_processing;
mod indexing;
mod markdown_text;
mod migrations;
mod preview;
mod sqlite_vec_ext;
mod trash;

use tauri::Manager;
use tauri_plugin_window_state::Builder as WindowStateBuilder;

#[tauri::command]
fn show_main_window(window: tauri::WebviewWindow) {
    if let Err(e) = window.show() {
        eprintln!("Failed to show window: {e}");
    }
    if let Err(e) = window.set_focus() {
        eprintln!("Failed to focus window: {e}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = file_opener::AppState::default();
    file_opener::initialize_opened_files(&app_state);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main_window) = app.get_webview_window("main") {
                show_main_window(main_window);
            }
        }))
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
            show_main_window,
            copy::copy,
            database::get_file_frontmatter,
            trash::move_to_trash,
            trash::move_many_to_trash,
            preview::get_note_preview,
            migrations::apply_appdata_migrations,
            indexing::index_workspace_command,
            indexing::index_note_command,
            indexing::get_indexing_meta_command,
            indexing::search_query_entries_command,
            indexing::get_backlinks_command,
            image_processing::get_image_properties_command,
            image_processing::edit_image_command
        ])
        .manage(app_state)
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        match event {
            tauri::RunEvent::Ready { .. } => {
                if let Some(main_window) = app_handle.get_webview_window("main") {
                    let _ = main_window.hide();
                }
                #[cfg(not(target_os = "macos"))]
                {
                    // Open edit window if files were passed as command line arguments
                    file_opener::open_edit_window_if_files_exist(app_handle);
                }
            }
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
