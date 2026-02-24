mod app;
mod commands;
mod local_api;
mod persistence;

use tauri::Manager;
use tauri_plugin_window_state::Builder as WindowStateBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = app::file_opening::AppState::default();
    app::file_opening::initialize_opened_files(&app_state);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            #[cfg(not(target_os = "macos"))]
            if app::file_opening::handle_single_instance_args(app, &_args) {
                return;
            }

            let app_state = app.state::<app::file_opening::AppState>();
            if app::window_lifecycle::should_suppress_main_show(&app_state) {
                return;
            }

            if let Some(main_window) = app.get_webview_window("main") {
                app::window_lifecycle::show_and_focus_main_window(main_window);
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_keyring::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard::init())
        .plugin(WindowStateBuilder::default().build())
        .manage(local_api::LocalApiRuntimeState::default())
        .manage(local_api::LocalApiAuthState::default())
        .invoke_handler(tauri::generate_handler![
            app::window_lifecycle::show_main_window,
            commands::filesystem::copy,
            commands::content::get_file_frontmatter,
            commands::filesystem::move_to_trash,
            commands::filesystem::move_many_to_trash,
            commands::content::get_note_preview,
            persistence::apply_appdata_migrations,
            commands::vault_indexing::index_workspace_command,
            commands::vault_indexing::index_note_command,
            commands::vault_indexing::rename_indexed_note_command,
            commands::vault_indexing::delete_indexed_note_command,
            commands::vault_indexing::get_indexing_meta_command,
            commands::vault_indexing::search_query_entries_command,
            commands::vault_indexing::resolve_wiki_link_command,
            commands::vault_indexing::get_backlinks_command,
            commands::vault_indexing::get_related_notes_command,
            commands::vault_indexing::get_graph_view_data_command,
            commands::vault_indexing::list_vault_workspaces_command,
            commands::vault_indexing::touch_vault_workspace_command,
            commands::vault_indexing::remove_vault_workspace_command,
            commands::vault_indexing::get_vault_embedding_config_command,
            commands::vault_indexing::set_vault_embedding_config_command,
            commands::local_api::start_local_api_server_command,
            commands::local_api::set_local_api_auth_token_command,
            commands::local_api::stop_local_api_server_command,
            commands::image::get_image_properties,
            commands::image::edit_image,
            commands::window::set_macos_traffic_lights_hidden,
            commands::window::set_macos_pinned_window_space_behavior
        ])
        .manage(app_state)
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        local_api::handle_run_event(app_handle, &event);
        app::window_lifecycle::handle_run_event(app_handle, &event);
    });
}
