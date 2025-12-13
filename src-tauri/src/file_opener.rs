use std::sync::{Arc, Mutex};
use tauri::Manager;

#[cfg(not(target_os = "macos"))]
use std::path::PathBuf;

#[derive(Default)]
pub struct AppState {
    pub opened_files: Arc<Mutex<Vec<String>>>,
}

/// Initializes opened_files when the app starts.
pub fn initialize_opened_files(app_state: &AppState) {
    let file_paths = get_opened_files_from_args();
    if !file_paths.is_empty() {
        let mut opened_files = app_state.opened_files.lock().unwrap();
        *opened_files = file_paths;
    }
}

/// Handles the RunEvent::Opened event on macOS.
#[cfg(target_os = "macos")]
pub fn handle_opened_event(app_handle: &tauri::AppHandle, urls: Vec<tauri::Url>) {
    let state = app_handle.state::<AppState>();
    let mut opened_files = state.opened_files.lock().unwrap();
    *opened_files = urls
        .iter()
        .filter_map(|u| u.to_file_path().ok())
        .map(|p| p.to_string_lossy().to_string())
        .collect();
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

/// Tauri command: retrieves the list of opened files.
#[tauri::command]
pub fn get_opened_files(state: tauri::State<AppState>) -> Vec<String> {
    state.opened_files.lock().unwrap().clone()
}
