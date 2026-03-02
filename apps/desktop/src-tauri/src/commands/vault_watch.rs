use std::sync::Mutex;

use mdit_vault_watch::{
    start_vault_watch, EventBatchPayload, VaultWatcherHandle, WatchConfig, VAULT_WATCH_BATCH_EVENT,
};
use tauri::{AppHandle, Emitter, Runtime, State};

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
    handle: VaultWatcherHandle,
}

fn stop_session(session: VaultWatchSession, error_message: &str) -> Result<(), String> {
    session
        .handle
        .stop()
        .map_err(|error| format!("{}: {}", error_message, error))
}

#[tauri::command]
pub fn start_vault_watch_command<R: Runtime>(
    app_handle: AppHandle<R>,
    state: State<'_, VaultWatchRuntimeState>,
    workspace_path: String,
) -> Result<(), String> {
    let previous_session = {
        let mut watcher = state.lock_watcher()?;
        if let Some(active) = watcher.as_ref() {
            if active.workspace_path == workspace_path {
                return Ok(());
            }
        }
        watcher.take()
    };

    if let Some(active) = previous_session {
        stop_session(active, "Failed to stop existing vault watcher")?;
    }

    let emit_workspace_path = workspace_path.clone();
    let emit_handle = app_handle.clone();
    let handle = start_vault_watch(&workspace_path, WatchConfig::default(), move |batch| {
        let payload = EventBatchPayload {
            workspace_path: emit_workspace_path.clone(),
            batch,
        };
        let _ = emit_handle.emit_to("main", VAULT_WATCH_BATCH_EVENT, payload);
    })
    .map_err(|error| format!("Failed to start vault watcher: {}", error))?;

    let (replaced_session, redundant_session) = {
        let mut watcher = state.lock_watcher()?;
        let new_session = VaultWatchSession {
            workspace_path,
            handle,
        };

        if let Some(active) = watcher.as_ref() {
            if active.workspace_path == new_session.workspace_path {
                (None, Some(new_session))
            } else {
                (watcher.replace(new_session), None)
            }
        } else {
            (watcher.replace(new_session), None)
        }
    };

    if let Some(redundant) = redundant_session {
        stop_session(redundant, "Failed to stop redundant vault watcher")?;
        return Ok(());
    }

    if let Some(active) = replaced_session {
        stop_session(active, "Failed to stop existing vault watcher")?;
    }

    Ok(())
}

#[tauri::command]
pub fn stop_vault_watch_command(
    state: State<'_, VaultWatchRuntimeState>,
    workspace_path: Option<String>,
) -> Result<(), String> {
    let session_to_stop = {
        let mut watcher = state.lock_watcher()?;
        let should_stop = match (watcher.as_ref(), workspace_path.as_ref()) {
            (Some(active), Some(expected_workspace_path)) => {
                &active.workspace_path == expected_workspace_path
            }
            (Some(_), None) => true,
            (None, _) => false,
        };

        if should_stop {
            watcher.take()
        } else {
            None
        }
    };

    if let Some(active) = session_to_stop {
        stop_session(active, "Failed to stop vault watcher")?;
    }

    Ok(())
}
