use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, SyncSender, TrySendError},
        Arc,
    },
    thread::JoinHandle,
};

use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};

use crate::{
    types::{EventBatch, VaultWatchError, WatchConfig},
    worker::{spawn_worker, WorkerMessage},
};

pub struct VaultWatcherHandle {
    watcher: Option<RecommendedWatcher>,
    worker_tx: Option<SyncSender<WorkerMessage>>,
    worker_thread: Option<JoinHandle<()>>,
    stopped: bool,
}

impl VaultWatcherHandle {
    pub fn stop(mut self) -> Result<(), VaultWatchError> {
        self.stop_inner()
    }

    fn stop_inner(&mut self) -> Result<(), VaultWatchError> {
        if self.stopped {
            return Ok(());
        }

        self.watcher.take();

        if let Some(tx) = self.worker_tx.take() {
            let _ = tx.send(WorkerMessage::Stop);
        }

        if let Some(handle) = self.worker_thread.take() {
            handle.join().map_err(|_| VaultWatchError::WorkerJoin)?;
        }

        self.stopped = true;
        Ok(())
    }
}

impl Drop for VaultWatcherHandle {
    fn drop(&mut self) {
        let _ = self.stop_inner();
    }
}

pub fn start_vault_watch(
    vault_root: impl AsRef<Path>,
    config: WatchConfig,
    on_batch: impl FnMut(EventBatch) + Send + 'static,
) -> Result<VaultWatcherHandle, VaultWatchError> {
    let config = config.normalized();
    let vault_root = canonicalize_vault_root(vault_root.as_ref())?;

    let (worker_tx, worker_rx) = mpsc::sync_channel(config.channel_capacity);
    let rescan_flag = Arc::new(AtomicBool::new(false));

    let worker_thread = spawn_worker(
        vault_root.clone(),
        config.clone(),
        worker_rx,
        Arc::clone(&rescan_flag),
        Box::new(on_batch),
    );

    let callback_tx = worker_tx.clone();
    let callback_rescan = Arc::clone(&rescan_flag);
    let mut watcher = RecommendedWatcher::new(
        move |result| match result {
            Ok(event) => {
                if let Err(error) = callback_tx.try_send(WorkerMessage::RawEvent(event)) {
                    match error {
                        TrySendError::Full(_) | TrySendError::Disconnected(_) => {
                            callback_rescan.store(true, Ordering::SeqCst);
                        }
                    }
                }
            }
            Err(_error) => {
                callback_rescan.store(true, Ordering::SeqCst);
            }
        },
        Config::default(),
    )?;

    let recursive_mode = if config.recursive {
        RecursiveMode::Recursive
    } else {
        RecursiveMode::NonRecursive
    };

    if let Err(source) = watcher.watch(&vault_root, recursive_mode) {
        let _ = worker_tx.send(WorkerMessage::Stop);
        let _ = worker_thread.join();
        return Err(VaultWatchError::WatchPath {
            path: vault_root.display().to_string(),
            source,
        });
    }

    Ok(VaultWatcherHandle {
        watcher: Some(watcher),
        worker_tx: Some(worker_tx),
        worker_thread: Some(worker_thread),
        stopped: false,
    })
}

fn canonicalize_vault_root(vault_root: &Path) -> Result<PathBuf, VaultWatchError> {
    if !vault_root.exists() {
        return Err(VaultWatchError::VaultRootNotFound(
            vault_root.display().to_string(),
        ));
    }

    if !vault_root.is_dir() {
        return Err(VaultWatchError::VaultRootNotDirectory(
            vault_root.display().to_string(),
        ));
    }

    std::fs::canonicalize(vault_root).map_err(|source| VaultWatchError::CanonicalizeVaultRoot {
        path: vault_root.display().to_string(),
        source,
    })
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        sync::mpsc,
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    use crate::{start_vault_watch, EventBatch, WatchConfig};

    fn create_temp_vault_dir() -> PathBuf {
        let mut dir = std::env::temp_dir();
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        dir.push(format!("vault-watch-test-{nanos}"));
        fs::create_dir_all(&dir).expect("temp vault dir should be created");
        dir
    }

    #[test]
    fn emits_relative_paths_for_changes_inside_vault() {
        let vault_dir = create_temp_vault_dir();
        let nested_dir = vault_dir.join("docs");
        fs::create_dir_all(&nested_dir).expect("nested dir should be created");

        let (tx, rx) = mpsc::channel::<EventBatch>();
        let watcher = start_vault_watch(
            &vault_dir,
            WatchConfig {
                debounce_ms: 50,
                ..WatchConfig::default()
            },
            move |batch| {
                let _ = tx.send(batch);
            },
        )
        .expect("watcher should start");

        let file_path = nested_dir.join("note.md");
        fs::write(&file_path, "# note").expect("file should be written");

        let mut got_relative = false;
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while std::time::Instant::now() < deadline {
            if let Ok(batch) = rx.recv_timeout(Duration::from_millis(300)) {
                let mut all_paths = batch.vault_rel_created;
                all_paths.extend(batch.vault_rel_modified);
                all_paths.extend(batch.vault_rel_removed);
                for rename in batch.vault_rel_renamed {
                    all_paths.push(rename.from_rel);
                    all_paths.push(rename.to_rel);
                }

                if all_paths.iter().any(|path| path == "docs/note.md") {
                    assert!(all_paths.iter().all(|path| !path.starts_with('/')));
                    got_relative = true;
                    break;
                }
            }
        }

        watcher.stop().expect("watcher should stop");
        let _ = fs::remove_dir_all(&vault_dir);
        assert!(
            got_relative,
            "should receive relative path event for docs/note.md"
        );
    }

    #[test]
    fn stop_prevents_later_event_delivery() {
        let vault_dir = create_temp_vault_dir();
        let (tx, rx) = mpsc::channel::<EventBatch>();
        let watcher = start_vault_watch(
            &vault_dir,
            WatchConfig {
                debounce_ms: 50,
                ..WatchConfig::default()
            },
            move |batch| {
                let _ = tx.send(batch);
            },
        )
        .expect("watcher should start");

        watcher.stop().expect("watcher should stop");

        let file_path = vault_dir.join("after-stop.md");
        fs::write(&file_path, "content").expect("file should be written");

        let received = rx.recv_timeout(Duration::from_millis(700)).is_ok();
        let _ = fs::remove_file(&file_path);
        let _ = fs::remove_dir_all(&vault_dir);
        assert!(!received, "no batch should arrive after stop");
    }
}
