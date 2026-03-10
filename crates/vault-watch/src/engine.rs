use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU8, Ordering},
        mpsc::{self, SyncSender, TrySendError},
        Arc,
    },
    thread::JoinHandle,
    time::Duration,
};

use notify::{ErrorKind, RecursiveMode};
use notify_debouncer_full::{
    new_debouncer_opt, notify::Config, DebounceEventResult, Debouncer, RecommendedCache,
};
use uuid::Uuid;

use crate::{
    types::{VaultWatchBatch, VaultWatchError, VaultWatchReason, WatchConfig},
    worker::{spawn_worker, WorkerMessage},
};

type VaultDebouncer = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

pub struct VaultWatcherHandle {
    watcher: Option<VaultDebouncer>,
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
    on_batch: impl FnMut(VaultWatchBatch) + Send + 'static,
) -> Result<VaultWatcherHandle, VaultWatchError> {
    let config = config.normalized();
    let vault_root = canonicalize_vault_root(vault_root.as_ref())?;

    let (worker_tx, worker_rx) = mpsc::sync_channel(config.channel_capacity);
    let rescan_reason = Arc::new(AtomicU8::new(0));
    let stream_id = Uuid::new_v4().to_string();

    let worker_thread = spawn_worker(
        vault_root.clone(),
        stream_id,
        config.clone(),
        worker_rx,
        Arc::clone(&rescan_reason),
        Box::new(on_batch),
    );

    let callback_tx = worker_tx.clone();
    let callback_rescan = Arc::clone(&rescan_reason);
    let debounce_timeout = Duration::from_millis(config.debounce_timeout_ms);
    let debounce_tick_rate = config.debounce_tick_rate_ms.map(Duration::from_millis);

    let mut watcher = new_debouncer_opt(
        debounce_timeout,
        debounce_tick_rate,
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                if let Err(error) = callback_tx.try_send(WorkerMessage::DebouncedEvents(events)) {
                    match error {
                        TrySendError::Full(_) | TrySendError::Disconnected(_) => {
                            store_rescan_reason(
                                &callback_rescan,
                                VaultWatchReason::WatcherOverflow,
                            );
                        }
                    }
                }
            }
            Err(errors) => {
                let reason = classify_callback_errors(&errors);
                match callback_tx.try_send(WorkerMessage::DebouncerErrors(errors)) {
                    Ok(()) => {}
                    Err(TrySendError::Full(_)) | Err(TrySendError::Disconnected(_)) => {
                        store_rescan_reason(&callback_rescan, reason);
                    }
                }
            }
        },
        RecommendedCache::new(),
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

pub fn start_vault_watch_channel(
    vault_root: impl AsRef<Path>,
    config: WatchConfig,
) -> Result<(VaultWatcherHandle, mpsc::Receiver<VaultWatchBatch>), VaultWatchError> {
    let (tx, rx) = mpsc::channel::<VaultWatchBatch>();
    let handle = start_vault_watch(vault_root, config, move |batch| {
        let _ = tx.send(batch);
    })?;

    Ok((handle, rx))
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

fn store_rescan_reason(signal: &AtomicU8, reason: VaultWatchReason) {
    let encoded = encode_rescan_reason(reason);
    let _ = signal.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |current| {
        if current >= encoded {
            None
        } else {
            Some(encoded)
        }
    });
}

fn encode_rescan_reason(reason: VaultWatchReason) -> u8 {
    match reason {
        VaultWatchReason::WatcherOverflow => 1,
        VaultWatchReason::WatcherError => 2,
        _ => 2,
    }
}

fn classify_callback_errors(errors: &[notify::Error]) -> VaultWatchReason {
    if errors
        .iter()
        .any(|error| matches!(error.kind, ErrorKind::MaxFilesWatch))
    {
        VaultWatchReason::WatcherOverflow
    } else {
        VaultWatchReason::WatcherError
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        sync::{
            atomic::{AtomicU8, Ordering},
            mpsc,
        },
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    use crate::{start_vault_watch, VaultWatchBatch, VaultWatchOp, VaultWatchReason, WatchConfig};

    use super::store_rescan_reason;

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

        let (tx, rx) = mpsc::channel::<VaultWatchBatch>();
        let watcher = start_vault_watch(
            &vault_dir,
            WatchConfig {
                debounce_timeout_ms: 50,
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
                let mut all_paths = Vec::new();
                for op in batch.ops {
                    match op {
                        VaultWatchOp::PathState { rel_path, .. } => all_paths.push(rel_path),
                        VaultWatchOp::Move {
                            from_rel, to_rel, ..
                        } => {
                            all_paths.push(from_rel);
                            all_paths.push(to_rel);
                        }
                        VaultWatchOp::ScanTree { rel_prefix, .. } => all_paths.push(rel_prefix),
                        VaultWatchOp::FullRescan { .. } => {}
                    }
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
        let (tx, rx) = mpsc::channel::<VaultWatchBatch>();
        let watcher = start_vault_watch(
            &vault_dir,
            WatchConfig {
                debounce_timeout_ms: 50,
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

    #[test]
    fn store_rescan_reason_keeps_highest_priority_reason() {
        let signal = AtomicU8::new(0);

        store_rescan_reason(&signal, VaultWatchReason::WatcherOverflow);
        assert_eq!(signal.load(Ordering::SeqCst), 1);

        store_rescan_reason(&signal, VaultWatchReason::WatcherError);
        assert_eq!(signal.load(Ordering::SeqCst), 2);

        store_rescan_reason(&signal, VaultWatchReason::WatcherOverflow);
        assert_eq!(signal.load(Ordering::SeqCst), 2);
    }
}
