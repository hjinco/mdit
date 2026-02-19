use std::sync::Mutex;
use tauri::Manager;

#[cfg(not(target_os = "macos"))]
use std::path::PathBuf;

#[derive(Default)]
pub struct AppState {
    pub opened_files: Mutex<Vec<String>>,
    pub suppress_next_main_show: Mutex<bool>,
    pub next_edit_window_id: Mutex<u64>,
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

    fn next_edit_window_label(&self) -> String {
        let mut next_id = self.next_edit_window_id.lock().unwrap();
        let label = format!("edit-{}", *next_id);
        *next_id += 1;
        label
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

#[cfg(not(target_os = "macos"))]
pub fn handle_single_instance_args(app_handle: &tauri::AppHandle, args: &[String]) -> bool {
    let file_paths = get_opened_files_from_args_list(args.iter());
    if file_paths.is_empty() {
        return false;
    }

    let state = app_handle.state::<AppState>();
    let mut opened_files = state.opened_files.lock().unwrap();
    *opened_files = file_paths.clone();
    drop(opened_files);
    state.mark_suppress_next_main_show();
    drop(state);
    open_edit_windows(app_handle, &file_paths);
    true
}

fn open_edit_window(app_handle: &tauri::AppHandle, file_path: &str) {
    let state = app_handle.state::<AppState>();
    let label = state.next_edit_window_label();

    // Build the URL with hash route
    let url = if file_path.is_empty() {
        "/edit".to_string()
    } else {
        format!("/edit?path={}", urlencoding::encode(file_path))
    };

    // Create an editor window on demand for file association opens (Finder, "Open with", etc.).
    // Window labels are unique so multiple edit windows can coexist.
    let created = (|| -> Option<tauri::WebviewWindow> {
        let mut config = app_handle.config().app.windows.first()?.clone();
        config.label = label;
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

fn open_edit_windows(app_handle: &tauri::AppHandle, file_paths: &[String]) {
    for file_path in file_paths {
        open_edit_window(app_handle, file_path);
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
        *opened_files = file_paths.clone();
        drop(opened_files);
        state.mark_suppress_next_main_show();
        open_edit_windows(app_handle, &file_paths);
    }
}

/// Opens the edit window if there are files in opened_files (for non-macOS platforms).
#[cfg(not(target_os = "macos"))]
pub fn open_edit_window_if_files_exist(app_handle: &tauri::AppHandle) {
    let state = app_handle.state::<AppState>();
    let opened_files = state.opened_files.lock().unwrap().clone();

    if !opened_files.is_empty() {
        open_edit_windows(app_handle, &opened_files);
    }
}

/// Collects files passed as command line arguments on non-macOS platforms (Windows, Linux, etc.).
#[cfg(not(target_os = "macos"))]
fn get_opened_files_from_args() -> Vec<String> {
    let args: Vec<String> = std::env::args().collect();
    get_opened_files_from_args_list(args.iter().skip(1))
}

#[cfg(not(target_os = "macos"))]
fn get_opened_files_from_args_list<'a, I>(args: I) -> Vec<String>
where
    I: Iterator<Item = &'a String>,
{
    args.filter_map(|arg| {
        let path = PathBuf::from(arg);
        if path.exists() && path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
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

    #[test]
    fn next_edit_window_labels_are_unique() {
        let state = AppState::default();

        assert_eq!(state.next_edit_window_label(), "edit-0");
        assert_eq!(state.next_edit_window_label(), "edit-1");
    }
}
