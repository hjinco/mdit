use tauri::Manager;

use crate::app::file_opening;

pub fn show_and_focus_main_window(window: tauri::WebviewWindow) {
    if let Err(error) = window.show() {
        eprintln!("Failed to show window: {error}");
    }
    if let Err(error) = window.set_focus() {
        eprintln!("Failed to focus window: {error}");
    }
}

pub fn should_suppress_main_show(app_state: &file_opening::AppState) -> bool {
    app_state.consume_suppress_next_main_show()
}

#[tauri::command]
pub fn show_main_window(
    window: tauri::WebviewWindow,
    app_state: tauri::State<'_, file_opening::AppState>,
) {
    if should_suppress_main_show(&app_state) {
        return;
    }

    show_and_focus_main_window(window);
}

pub fn handle_run_event(app_handle: &tauri::AppHandle, event: tauri::RunEvent) {
    match event {
        tauri::RunEvent::Ready { .. } => {
            if let Some(main_window) = app_handle.get_webview_window("main") {
                let _ = main_window.hide();
            }
            #[cfg(not(target_os = "macos"))]
            {
                // Open edit window if files were passed as command line arguments
                file_opening::open_edit_window_if_files_exist(app_handle);
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            // Show main window if it exists, otherwise create it
            if let Some(main_window) = app_handle.get_webview_window("main") {
                show_and_focus_main_window(main_window);
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Opened { urls } => {
            file_opening::handle_opened_event(app_handle, urls);
        }
        _ => {}
    }
}
