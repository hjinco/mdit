use std::sync::{Arc, Mutex};

use mdit_vault_indexer::{start_vault_indexer, VaultIndexerConfig, VaultIndexerHandle};
use mdit_vault_indexing::VaultIndexingRuntimeAdapter;
use mdit_vault_watch::{VaultWatchBatchPayload, VAULT_WATCH_BATCH_EVENT};
use tauri::{AppHandle, Emitter, Runtime, State, Webview};

const MAIN_WEBVIEW: &str = "main";

#[derive(Default)]
pub struct VaultWatchRuntimeState {
    watcher: Mutex<Option<VaultWatchSession>>,
}

impl VaultWatchRuntimeState {
    fn lock_watcher(&self) -> Result<std::sync::MutexGuard<'_, Option<VaultWatchSession>>, String> {
        self.watcher
            .lock()
            .map_err(|error| format!("Failed to lock vault watch runtime state: {}", error))
    }
}

struct VaultWatchSession {
    workspace_path: String,
    session_id: String,
    handle: VaultIndexerHandle,
}

fn stop_session(session: VaultWatchSession, error_message: &str) -> Result<(), String> {
    session
        .handle
        .stop()
        .map_err(|error| format!("{}: {}", error_message, error))
}

fn require_main_webview<R: Runtime>(webview: &Webview<R>) -> Result<(), String> {
    if webview.label() == MAIN_WEBVIEW {
        Ok(())
    } else {
        Err("Only the main window can control the vault watcher".into())
    }
}

#[tauri::command]
pub fn start_vault_watch_command<R: Runtime>(
    app_handle: AppHandle<R>,
    webview: Webview<R>,
    state: State<'_, VaultWatchRuntimeState>,
    workspace_path: String,
    session_id: String,
) -> Result<(), String> {
    require_main_webview(&webview)?;
    let mut watcher = state.lock_watcher()?;
    if watcher.as_ref().is_some_and(|active| {
        active.workspace_path == workspace_path && active.session_id == session_id
    }) {
        return Ok(());
    }
    if let Some(active) = watcher.take() {
        stop_session(active, "Failed to stop existing vault watcher")?;
    }

    let db_path = crate::persistence::run_app_migrations(&app_handle)?;
    let emit_workspace_path = workspace_path.clone();
    let emit_session_id = session_id.clone();
    let emit_handle = app_handle.clone();

    let handle = start_vault_indexer(
        &workspace_path,
        &db_path,
        Arc::new(VaultIndexingRuntimeAdapter),
        VaultIndexerConfig::default(),
        move |batch| {
            let payload = VaultWatchBatchPayload {
                workspace_path: emit_workspace_path.clone(),
                session_id: emit_session_id.clone(),
                batch,
            };
            let _ = emit_handle.emit_to(MAIN_WEBVIEW, VAULT_WATCH_BATCH_EVENT, payload);
        },
    )
    .map_err(|error| format!("Failed to start vault indexer: {}", error))?;

    *watcher = Some(VaultWatchSession {
        workspace_path,
        session_id,
        handle,
    });
    Ok(())
}

#[tauri::command]
pub fn stop_vault_watch_command<R: Runtime>(
    webview: Webview<R>,
    state: State<'_, VaultWatchRuntimeState>,
    workspace_path: String,
    session_id: String,
) -> Result<(), String> {
    require_main_webview(&webview)?;
    let mut watcher = state.lock_watcher()?;
    let matches = watcher.as_ref().is_some_and(|active| {
        active.workspace_path == workspace_path && active.session_id == session_id
    });
    if matches {
        if let Some(active) = watcher.take() {
            stop_session(active, "Failed to stop vault watcher")?;
        }
    }

    Ok(())
}
