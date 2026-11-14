mod app;
mod commands;
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
        .manage(commands::vault_watch::VaultWatchRuntimeState::default())
        .invoke_handler(tauri::generate_handler![
            app::window_lifecycle::show_main_window,
            commands::credentials::list_credential_providers_command,
            commands::credentials::get_credential_command,
            commands::credentials::set_api_key_credential_command,
            commands::credentials::set_codex_credential_command,
            commands::credentials::delete_credential_command,
            commands::credentials::get_app_secret_command,
            commands::credentials::set_app_secret_command,
            commands::credentials::delete_app_secret_command,
            commands::filesystem::copy,
            commands::document_files::read_document_file,
            commands::document_files::write_document_file,
            commands::document_files::rename_document_file,
            commands::content::get_file_frontmatter,
            commands::filesystem::move_to_trash,
            commands::filesystem::move_many_to_trash,
            commands::content::get_note_preview,
            persistence::apply_appdata_migrations,
            commands::vault_indexing::index_vault_documents_command,
            commands::vault_indexing::index_note_command,
            commands::vault_indexing::refresh_workspace_embeddings_command,
            commands::vault_indexing::rename_indexed_note_command,
            commands::vault_indexing::delete_indexed_note_command,
            commands::vault_indexing::get_indexing_meta_command,
            commands::vault_indexing::search_query_entries_command,
            commands::vault_indexing::search_tag_entries_command,
            commands::vault_indexing::resolve_wiki_link_command,
            commands::vault_indexing::get_backlinks_command,
            commands::vault_indexing::get_related_notes_command,
            commands::vault_indexing::list_vault_workspaces_command,
            commands::vault_indexing::touch_vault_workspace_command,
            commands::vault_indexing::remove_vault_workspace_command,
            commands::vault_indexing::get_vault_embedding_config_command,
            commands::vault_indexing::set_vault_embedding_config_command,
            commands::vault_watch::start_vault_watch_command,
            commands::vault_watch::stop_vault_watch_command,
            commands::ollama::list_ollama_models_command,
            commands::image::get_image_properties,
            commands::image::edit_image,
            commands::window::set_macos_traffic_lights_hidden,
            commands::window::set_macos_pinned_window_space_behavior
        ])
        .manage(app_state)
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        app::window_lifecycle::handle_run_event(app_handle, &event);
    });
}
