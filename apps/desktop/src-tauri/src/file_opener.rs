use std::sync::{Arc, Mutex};
use tauri::Manager;

#[cfg(not(target_os = "macos"))]
use std::path::PathBuf;

#[derive(Default)]
pub struct AppState {
    pub opened_files: Arc<Mutex<Vec<String>>>,
    pub suppress_next_main_show: Arc<Mutex<bool>>,
}

impl AppState {
    pub fn mark_suppress_next_main_show(&self) {
        let mut suppress = self.suppress_next_main_show.lock().unwrap();
        *suppress = true;
    }

    pub fn consume_suppress_next_main_show(&self) -> bool {
        let mut suppress = self.suppress_next_main_show.lock().unwrap();
        if *suppress {
            *suppress = false;
            true
        } else {
            false
        }
    }
}

fn initialize_opened_files_with_paths(app_state: &AppState, file_paths: Vec<String>) {
    if file_paths.is_empty() {
        return;
    }

    let mut opened_files = app_state.opened_files.lock().unwrap();
    *opened_files = file_paths;
    drop(opened_files);

    app_state.mark_suppress_next_main_show();
}

/// Initializes opened_files when the app starts.
pub fn initialize_opened_files(app_state: &AppState) {
    let file_paths = get_opened_files_from_args();
    initialize_opened_files_with_paths(app_state, file_paths);
}

/// Opens or creates the edit window.
fn open_edit_window(app_handle: &tauri::AppHandle) {
    if let Some(edit_window) = app_handle.get_webview_window("edit") {
        let _ = edit_window.show();
        let _ = edit_window.set_focus();
        return;
    }

    // Get the first opened file to include in the URL hash
    let state = app_handle.state::<AppState>();
    let opened_files = state.opened_files.lock().unwrap();
    let file_path = opened_files.first().cloned().unwrap_or_default();

    // Build the URL with hash route
    let url = if file_path.is_empty() {
        "/edit".to_string()
    } else {
        format!("/edit?path={}", urlencoding::encode(&file_path))
    };

    // Create the editor-only window on demand for file association opens (Finder, "Open with", etc.).
    // We clone the main window config so styling stays consistent with tauri.conf.json.
    let created = (|| -> Option<tauri::WebviewWindow> {
        let mut config = app_handle.config().app.windows.first()?.clone();
        config.label = "edit".to_string();
        config.visible = true;
        config.url = tauri::WebviewUrl::App(url.into());

        tauri::WebviewWindowBuilder::from_config(app_handle, &config)
            .ok()?
            .build()
            .ok()
    })();

    if let Some(edit_window) = created {
        let _ = edit_window.show();
        let _ = edit_window.set_focus();
    }
}

/// Handles the RunEvent::Opened event on macOS.
#[cfg(target_os = "macos")]
pub fn handle_opened_event(app_handle: &tauri::AppHandle, urls: Vec<tauri::Url>) {
    let file_paths: Vec<String> = urls
        .iter()
        .filter_map(|u| u.to_file_path().ok())
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    if file_paths.is_empty() {
        return;
    }

    {
        let state = app_handle.state::<AppState>();
        let mut opened_files = state.opened_files.lock().unwrap();
        *opened_files = file_paths;
        drop(opened_files);
        state.mark_suppress_next_main_show();
    }

    open_edit_window(app_handle);

    if let Some(main_window) = app_handle.get_webview_window("main") {
        let _ = main_window.hide();
    }
}

/// Opens the edit window if there are files in opened_files (for non-macOS platforms).
#[cfg(not(target_os = "macos"))]
pub fn open_edit_window_if_files_exist(app_handle: &tauri::AppHandle) {
    let state = app_handle.state::<AppState>();
    let opened_files = state.opened_files.lock().unwrap();

    if !opened_files.is_empty() {
        open_edit_window(app_handle);
    }
}

/// Collects files passed as command line arguments on non-macOS platforms (Windows, Linux, etc.).
#[cfg(not(target_os = "macos"))]
fn get_opened_files_from_args() -> Vec<String> {
    let args: Vec<String> = std::env::args().collect();
    args.iter()
        .skip(1) // First argument is the executable path
        .filter_map(|arg| {
            let path = PathBuf::from(arg);
            if path.exists() && path.is_file() && path.extension().map_or(false, |ext| ext == "md")
            {
                Some(path.to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect()
}

/// Returns an empty vector on macOS (uses RunEvent::Opened instead).
#[cfg(target_os = "macos")]
fn get_opened_files_from_args() -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::{initialize_opened_files_with_paths, AppState};

    #[test]
    fn suppress_flag_is_consumed_once() {
        let state = AppState::default();

        assert!(!state.consume_suppress_next_main_show());

        state.mark_suppress_next_main_show();
        assert!(state.consume_suppress_next_main_show());
        assert!(!state.consume_suppress_next_main_show());
    }

    #[test]
    fn initialize_with_paths_sets_opened_files_and_marks_suppress() {
        let state = AppState::default();
        let paths = vec!["/tmp/first.md".to_string(), "/tmp/second.md".to_string()];

        initialize_opened_files_with_paths(&state, paths.clone());

        let opened_files = state.opened_files.lock().unwrap().clone();
        assert_eq!(opened_files, paths);
        assert!(state.consume_suppress_next_main_show());
        assert!(!state.consume_suppress_next_main_show());
    }
}
