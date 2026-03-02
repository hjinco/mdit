use std::{
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
    types::{EventBatch, WatchConfig},
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
    mut on_batch: Box<dyn FnMut(EventBatch) + Send + 'static>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        let debounce = Duration::from_millis(config.debounce_ms);
        let rename_window = Duration::from_millis(config.rename_pair_window_ms);
        let idle_poll = Duration::from_millis(IDLE_POLL_INTERVAL_MS);

        let mut pending = PendingBatch::default();
        let mut seq: u64 = 0;
        let mut last_input_at: Option<Instant> = None;

        loop {
            let now = Instant::now();
            pending.expire_stale_rename_from(now, rename_window);

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
                    pending.flush_unmatched_rename_from_as_removed();

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
