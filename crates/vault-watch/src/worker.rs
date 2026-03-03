use std::{
    collections::BTreeSet,
    path::Path,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{Receiver, RecvTimeoutError},
        Arc,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use crate::{
    normalize::PendingBatch,
    path::to_vault_rel_path,
    types::{VaultChangeBatch, WatchConfig},
};

const IDLE_POLL_INTERVAL_MS: u64 = 200;

pub(crate) enum WorkerMessage {
    RawEvent(notify::Event),
    Stop,
}

pub(crate) fn spawn_worker(
    vault_root: PathBuf,
    config: WatchConfig,
    rx: Receiver<WorkerMessage>,
    rescan_flag: Arc<AtomicBool>,
    mut on_batch: Box<dyn FnMut(VaultChangeBatch) + Send + 'static>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        let debounce = Duration::from_millis(config.debounce_ms);
        let rename_window = Duration::from_millis(config.rename_pair_window_ms);
        let idle_poll = Duration::from_millis(IDLE_POLL_INTERVAL_MS);

        let (initial_dir_index, bootstrap_failed) = if config.bootstrap_dir_index {
            match collect_directory_index(&vault_root) {
                Ok(index) => (index, false),
                Err(error) => {
                    eprintln!(
                        "vault-watch: failed to bootstrap directory index for {}: {error}",
                        vault_root.display()
                    );
                    (BTreeSet::new(), true)
                }
            }
        } else {
            (BTreeSet::new(), false)
        };

        let mut pending = PendingBatch::new(initial_dir_index);
        let mut seq: u64 = 0;
        let mut last_input_at: Option<Instant> = if bootstrap_failed {
            pending.mark_rescan(true);
            Some(Instant::now())
        } else {
            None
        };

        loop {
            let now = Instant::now();
            pending.expire_stale_rename_from(&vault_root, now, rename_window);

            if rescan_flag.swap(false, Ordering::SeqCst) {
                pending.mark_rescan(true);
                last_input_at = Some(now);
            }

            if should_flush(&pending, last_input_at, debounce, now) {
                seq += 1;
                if let Some(batch) = pending.take_batch(seq, config.max_batch_paths) {
                    on_batch(batch);
                }

                if !pending.has_emitable_changes() {
                    last_input_at = None;
                }
            }

            let timeout = next_timeout(
                &pending,
                last_input_at,
                debounce,
                rename_window,
                now,
                idle_poll,
            );
            match rx.recv_timeout(timeout) {
                Ok(WorkerMessage::RawEvent(event)) => {
                    let event_now = Instant::now();
                    pending.apply_notify_event(&vault_root, &event, event_now, rename_window);
                    last_input_at = Some(event_now);
                }
                Ok(WorkerMessage::Stop) => {
                    if rescan_flag.swap(false, Ordering::SeqCst) {
                        pending.mark_rescan(true);
                    }
                    pending.flush_unmatched_rename_from_as_removed(&vault_root);

                    if pending.has_pending_activity() {
                        seq += 1;
                        if let Some(batch) = pending.take_batch(seq, config.max_batch_paths) {
                            on_batch(batch);
                        }
                    }
                    break;
                }
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    })
}

fn collect_directory_index(vault_root: &Path) -> std::io::Result<BTreeSet<String>> {
    let mut directory_index = BTreeSet::new();

    for entry in walkdir::WalkDir::new(vault_root)
        .min_depth(1)
        .follow_links(false)
    {
        let entry = entry.map_err(std::io::Error::other)?;
        if !entry.file_type().is_dir() {
            continue;
        }

        if let Some(rel_path) = to_vault_rel_path(vault_root, entry.path()) {
            directory_index.insert(rel_path);
        }
    }

    Ok(directory_index)
}

#[cfg(test)]
mod tests {
    use super::collect_directory_index;
    use std::{
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
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

    #[cfg(unix)]
    fn symlink_dir(link_target: &Path, link_path: &Path) {
        std::os::unix::fs::symlink(link_target, link_path)
            .expect("directory symlink should be created");
    }

    #[cfg(unix)]
    #[test]
    fn collect_directory_index_handles_symlink_cycle() {
        let root = temp_vault_dir();
        let nested = root.join("a/b");
        std::fs::create_dir_all(&nested).expect("nested directory should be created");

        let back_to_root = nested.join("back_to_root");
        symlink_dir(&root, &back_to_root);

        let index = collect_directory_index(&root).expect("index should be collected");

        assert!(index.contains("a"));
        assert!(index.contains("a/b"));

        let _ = std::fs::remove_dir_all(&root);
    }
}

fn should_flush(
    pending: &PendingBatch,
    last_input_at: Option<Instant>,
    debounce: Duration,
    now: Instant,
) -> bool {
    if !pending.has_emitable_changes() {
        return false;
    }

    let Some(last_input_at) = last_input_at else {
        return true;
    };

    now.duration_since(last_input_at) >= debounce
}

fn next_timeout(
    pending: &PendingBatch,
    last_input_at: Option<Instant>,
    debounce: Duration,
    rename_window: Duration,
    now: Instant,
    idle_poll: Duration,
) -> Duration {
    let mut timeout = idle_poll;

    if let Some(last_input_at) = last_input_at {
        if pending.has_emitable_changes() {
            let deadline = last_input_at + debounce;
            timeout = timeout.min(
                deadline
                    .checked_duration_since(now)
                    .unwrap_or_else(|| Duration::from_millis(0)),
            );
        }
    }

    if let Some(until_rename_expiry) = pending.next_rename_expiry_in(rename_window, now) {
        timeout = timeout.min(until_rename_expiry);
    }

    timeout
}
