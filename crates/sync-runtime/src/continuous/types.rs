use std::{
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use tokio::sync::mpsc;

use crate::SyncRuntimeError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContinuousSyncConfig {
    pub debounce_ms: u64,
    pub remote_poll_interval_ms: u64,
    pub retry_min_ms: u64,
    pub retry_max_ms: u64,
    pub suppression_ttl_ms: u64,
    pub startup_sync: bool,
    pub max_head_conflict_retries: u8,
}

impl Default for ContinuousSyncConfig {
    fn default() -> Self {
        Self {
            debounce_ms: 1_500,
            remote_poll_interval_ms: 45_000,
            retry_min_ms: 2_000,
            retry_max_ms: 120_000,
            suppression_ttl_ms: 3_000,
            startup_sync: true,
            max_head_conflict_retries: 3,
        }
    }
}

impl ContinuousSyncConfig {
    pub(crate) fn debounce_duration(&self) -> Duration {
        Duration::from_millis(self.debounce_ms.max(1))
    }

    pub(crate) fn remote_poll_duration(&self) -> Duration {
        Duration::from_millis(self.remote_poll_interval_ms.max(1))
    }

    pub(crate) fn retry_min_duration(&self) -> Duration {
        Duration::from_millis(self.retry_min_ms.max(1))
    }

    pub(crate) fn retry_max_duration(&self) -> Duration {
        Duration::from_millis(self.retry_max_ms.max(self.retry_min_ms).max(1))
    }

    pub(crate) fn suppression_ttl_duration(&self) -> Duration {
        Duration::from_millis(self.suppression_ttl_ms.max(1))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContinuousSyncStatus {
    Idle,
    Scheduled,
    Syncing,
    Backoff,
    Paused,
    Stopped,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContinuousSyncPauseReason {
    MissingDeviceId,
    Unauthorized,
    Forbidden,
    NotFound,
    LocalFailure,
    InvalidRemoteState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContinuousSyncTrigger {
    Startup,
    Manual,
    RemotePoll,
    LocalChanges {
        rel_paths: Vec<String>,
        requires_full_scan: bool,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContinuousSyncStatusEvent {
    pub status: ContinuousSyncStatus,
    pub reason: Option<ContinuousSyncPauseReason>,
    pub next_attempt_at_unix_ms: Option<u64>,
    pub last_error: Option<String>,
}

impl ContinuousSyncStatusEvent {
    pub(crate) fn idle() -> Self {
        Self {
            status: ContinuousSyncStatus::Idle,
            reason: None,
            next_attempt_at_unix_ms: None,
            last_error: None,
        }
    }
}

pub trait ContinuousSyncStatusSink: Send + Sync {
    fn emit(&self, event: ContinuousSyncStatusEvent);
}

pub(crate) enum SessionCommand {
    Trigger(ContinuousSyncTrigger),
    Stop,
}

#[derive(Clone)]
pub struct ContinuousSyncHandle {
    command_tx: mpsc::UnboundedSender<SessionCommand>,
    status: Arc<Mutex<ContinuousSyncStatusEvent>>,
}

impl ContinuousSyncHandle {
    pub(crate) fn new(
        command_tx: mpsc::UnboundedSender<SessionCommand>,
        status: Arc<Mutex<ContinuousSyncStatusEvent>>,
    ) -> Self {
        Self { command_tx, status }
    }

    pub fn submit_trigger(&self, trigger: ContinuousSyncTrigger) -> Result<(), SyncRuntimeError> {
        self.command_tx
            .send(SessionCommand::Trigger(trigger))
            .map_err(|_| SyncRuntimeError::SessionClosed)
    }

    pub fn current_status(&self) -> ContinuousSyncStatusEvent {
        self.status
            .lock()
            .expect("continuous sync status lock")
            .clone()
    }

    pub fn stop(&self) -> Result<(), SyncRuntimeError> {
        if self.command_tx.send(SessionCommand::Stop).is_err() {
            return Err(SyncRuntimeError::SessionClosed);
        }
        Ok(())
    }
}

pub(crate) fn unix_ms_after(duration: Duration) -> u64 {
    now_unix_ms().saturating_add(duration.as_millis() as u64)
}

pub(crate) fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
