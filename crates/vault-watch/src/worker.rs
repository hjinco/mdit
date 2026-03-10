use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicU8, Ordering},
        mpsc::{Receiver, RecvTimeoutError},
        Arc,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use notify::ErrorKind;
use notify_debouncer_full::DebouncedEvent;

use crate::{
    entry_index::collect_entry_index,
    observe::PendingBatch,
    types::{VaultWatchBatch, VaultWatchReason, WatchConfig},
};

const IDLE_POLL_INTERVAL_MS: u64 = 50;

pub(crate) enum WorkerMessage {
    DebouncedEvents(Vec<DebouncedEvent>),
    DebouncerErrors(Vec<notify::Error>),
    Stop,
}

pub(crate) fn spawn_worker(
    vault_root: PathBuf,
    stream_id: String,
    config: WatchConfig,
    rx: Receiver<WorkerMessage>,
    rescan_reason: Arc<AtomicU8>,
    mut on_batch: Box<dyn FnMut(VaultWatchBatch) + Send + 'static>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        let idle_poll = Duration::from_millis(IDLE_POLL_INTERVAL_MS);
        let rename_pair_window = Duration::from_millis(config.rename_pair_window_ms);
        let (initial_entry_index, bootstrap_failed) = if config.bootstrap_dir_index {
            match collect_entry_index(&vault_root) {
                Ok(index) => (index, false),
                Err(error) => {
                    eprintln!(
                        "vault-watch: failed to bootstrap entry index for {}: {error}",
                        vault_root.display()
                    );
                    (Default::default(), true)
                }
            }
        } else {
            (Default::default(), false)
        };

        let mut pending = PendingBatch::with_trusted_entry_index(
            initial_entry_index,
            config.bootstrap_dir_index && !bootstrap_failed,
        );
        let mut seq_in_stream: u64 = 0;

        if bootstrap_failed {
            pending.mark_full_rescan(VaultWatchReason::BootstrapFailure);
            flush_pending(
                &mut pending,
                &vault_root,
                &stream_id,
                &mut seq_in_stream,
                config.max_batch_paths,
                &mut on_batch,
            );
        }

        loop {
            pending.expire_pending_renames(
                &vault_root,
                std::time::Instant::now(),
                rename_pair_window,
            );
            merge_pending_rescan_reason(&mut pending, &rescan_reason);
            flush_pending(
                &mut pending,
                &vault_root,
                &stream_id,
                &mut seq_in_stream,
                config.max_batch_paths,
                &mut on_batch,
            );

            let message = match rx.recv_timeout(idle_poll) {
                Ok(message) => message,
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => {
                    pending.finalize_pending_renames(&vault_root);
                    merge_pending_rescan_reason(&mut pending, &rescan_reason);
                    flush_pending(
                        &mut pending,
                        &vault_root,
                        &stream_id,
                        &mut seq_in_stream,
                        config.max_batch_paths,
                        &mut on_batch,
                    );
                    break;
                }
            };

            match message {
                WorkerMessage::DebouncedEvents(events) => {
                    pending.apply_debounced_events(&vault_root, &events);
                }
                WorkerMessage::DebouncerErrors(errors) => {
                    pending.mark_full_rescan(classify_debouncer_errors(&errors));
                }
                WorkerMessage::Stop => {
                    pending.finalize_pending_renames(&vault_root);
                    merge_pending_rescan_reason(&mut pending, &rescan_reason);
                    flush_pending(
                        &mut pending,
                        &vault_root,
                        &stream_id,
                        &mut seq_in_stream,
                        config.max_batch_paths,
                        &mut on_batch,
                    );
                    break;
                }
            }

            pending.expire_pending_renames(
                &vault_root,
                std::time::Instant::now(),
                rename_pair_window,
            );
            merge_pending_rescan_reason(&mut pending, &rescan_reason);
            flush_pending(
                &mut pending,
                &vault_root,
                &stream_id,
                &mut seq_in_stream,
                config.max_batch_paths,
                &mut on_batch,
            );
        }
    })
}

fn flush_pending(
    pending: &mut PendingBatch,
    vault_root: &PathBuf,
    stream_id: &str,
    seq_in_stream: &mut u64,
    max_batch_paths: usize,
    on_batch: &mut dyn FnMut(VaultWatchBatch),
) {
    if let Some(batch) =
        pending.take_batch(vault_root, stream_id, *seq_in_stream + 1, max_batch_paths)
    {
        *seq_in_stream += 1;
        on_batch(batch);
    }
}

fn merge_pending_rescan_reason(pending: &mut PendingBatch, signal: &AtomicU8) {
    if let Some(reason) = take_rescan_reason(signal) {
        pending.mark_full_rescan(reason);
    }
}

fn take_rescan_reason(signal: &AtomicU8) -> Option<VaultWatchReason> {
    match signal.swap(0, Ordering::SeqCst) {
        1 => Some(VaultWatchReason::WatcherOverflow),
        2 => Some(VaultWatchReason::WatcherError),
        _ => None,
    }
}

fn classify_debouncer_errors(errors: &[notify::Error]) -> VaultWatchReason {
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
        path::{Path, PathBuf},
        sync::{
            atomic::{AtomicU8, Ordering},
            mpsc, Arc,
        },
        time::Duration,
        time::{Instant, SystemTime, UNIX_EPOCH},
    };

    use notify::event::{EventAttributes, ModifyKind, RenameMode};
    use notify::{Event, EventKind};
    use notify_debouncer_full::DebouncedEvent;

    use super::{spawn_worker, WorkerMessage};
    use crate::{
        entry_index::collect_entry_index,
        types::{VaultEntryState, VaultWatchOp, WatchConfig},
        VaultWatchReason,
    };

    fn temp_vault_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should move forward")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("vault-watch-worker-test-{nanos}"));
        std::fs::create_dir_all(&path).expect("temp vault should be created");
        path
    }

    fn event(kind: EventKind, paths: &[PathBuf]) -> Event {
        Event {
            kind,
            paths: paths.to_vec(),
            attrs: EventAttributes::new(),
        }
    }

    fn debounced_event_at(kind: EventKind, paths: &[PathBuf], time: Instant) -> DebouncedEvent {
        DebouncedEvent::new(event(kind, paths), time)
    }

    #[cfg(unix)]
    fn symlink_dir(link_target: &Path, link_path: &Path) {
        std::os::unix::fs::symlink(link_target, link_path)
            .expect("directory symlink should be created");
    }

    #[cfg(unix)]
    #[test]
    fn collect_entry_index_handles_symlink_cycle() {
        let root = temp_vault_dir();
        let nested = root.join("a/b");
        std::fs::create_dir_all(&nested).expect("nested directory should be created");

        let back_to_root = nested.join("back_to_root");
        symlink_dir(&root, &back_to_root);

        let index = collect_entry_index(&root).expect("index should be collected");

        assert_eq!(index.get("a"), Some(&VaultEntryState::Directory));
        assert_eq!(index.get("a/b"), Some(&VaultEntryState::Directory));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn emits_full_rescan_when_rescan_reason_arrives_without_new_messages() {
        let root = temp_vault_dir();
        let (worker_tx, worker_rx) = mpsc::channel();
        let (batch_tx, batch_rx) = mpsc::channel();
        let rescan_reason = Arc::new(AtomicU8::new(0));

        let worker = spawn_worker(
            root.clone(),
            "stream-1".to_string(),
            WatchConfig::default(),
            worker_rx,
            Arc::clone(&rescan_reason),
            Box::new(move |batch| {
                let _ = batch_tx.send(batch);
            }),
        );

        rescan_reason.store(1, Ordering::SeqCst);

        let batch = batch_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("worker should emit full rescan after idle poll");
        assert_eq!(batch.seq_in_stream, 1);
        assert_eq!(
            batch.ops,
            vec![VaultWatchOp::FullRescan {
                reason: VaultWatchReason::WatcherOverflow,
            }]
        );

        worker_tx
            .send(WorkerMessage::Stop)
            .expect("worker stop should send");
        worker.join().expect("worker thread should join");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn expires_split_rename_from_candidates_during_idle_poll() {
        let root = temp_vault_dir();
        let file = root.join("a.md");
        std::fs::write(&file, "content").expect("file should be written");
        let (worker_tx, worker_rx) = mpsc::channel();
        let (batch_tx, batch_rx) = mpsc::channel();
        let rescan_reason = Arc::new(AtomicU8::new(0));

        let worker = spawn_worker(
            root.clone(),
            "stream-1".to_string(),
            WatchConfig {
                rename_pair_window_ms: 20,
                ..WatchConfig::default()
            },
            worker_rx,
            Arc::clone(&rescan_reason),
            Box::new(move |batch| {
                let _ = batch_tx.send(batch);
            }),
        );

        std::thread::sleep(Duration::from_millis(50));
        std::fs::remove_file(&file).expect("file should be removed");
        worker_tx
            .send(WorkerMessage::DebouncedEvents(vec![debounced_event_at(
                EventKind::Modify(ModifyKind::Name(RenameMode::From)),
                std::slice::from_ref(&file),
                Instant::now(),
            )]))
            .expect("rename-from event should send");

        let batch = batch_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("worker should flush expired rename-from as delete");
        assert_eq!(
            batch.ops,
            vec![VaultWatchOp::PathState {
                rel_path: "a.md".to_string(),
                before: VaultEntryState::File,
                after: VaultEntryState::Missing,
            }]
        );

        worker_tx
            .send(WorkerMessage::Stop)
            .expect("worker stop should send");
        worker.join().expect("worker thread should join");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn stop_flushes_pending_rename_from_candidates() {
        let root = temp_vault_dir();
        let file = root.join("a.md");
        std::fs::write(&file, "content").expect("file should be written");
        let (worker_tx, worker_rx) = mpsc::channel();
        let (batch_tx, batch_rx) = mpsc::channel();
        let rescan_reason = Arc::new(AtomicU8::new(0));

        let worker = spawn_worker(
            root.clone(),
            "stream-1".to_string(),
            WatchConfig {
                rename_pair_window_ms: 1000,
                ..WatchConfig::default()
            },
            worker_rx,
            Arc::clone(&rescan_reason),
            Box::new(move |batch| {
                let _ = batch_tx.send(batch);
            }),
        );

        std::thread::sleep(Duration::from_millis(50));
        std::fs::remove_file(&file).expect("file should be removed");
        worker_tx
            .send(WorkerMessage::DebouncedEvents(vec![debounced_event_at(
                EventKind::Modify(ModifyKind::Name(RenameMode::From)),
                std::slice::from_ref(&file),
                Instant::now(),
            )]))
            .expect("rename-from event should send");
        worker_tx
            .send(WorkerMessage::Stop)
            .expect("worker stop should send");

        let batch = batch_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("stop should flush pending rename-from");
        assert_eq!(
            batch.ops,
            vec![VaultWatchOp::PathState {
                rel_path: "a.md".to_string(),
                before: VaultEntryState::File,
                after: VaultEntryState::Missing,
            }]
        );

        worker.join().expect("worker thread should join");
        let _ = std::fs::remove_dir_all(&root);
    }
}
