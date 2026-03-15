use std::{
    collections::BTreeSet,
    sync::{Arc, Mutex},
    time::Duration,
};

use sync_client::{SyncProgressSink, SyncRemoteClient};
use tokio::{
    sync::mpsc,
    time::{sleep_until, Instant},
};

use crate::SyncRuntimeConfig;

use super::{
    journal::SuppressionJournal,
    runner::{run_sync_attempt, RunFailureAction},
    types::{
        unix_ms_after, ContinuousSyncConfig, ContinuousSyncHandle, ContinuousSyncPauseReason,
        ContinuousSyncStatus, ContinuousSyncStatusEvent, ContinuousSyncStatusSink,
        ContinuousSyncTrigger, SessionCommand,
    },
};

pub fn start_continuous_sync_session<R, P, S>(
    config: SyncRuntimeConfig,
    continuous_config: ContinuousSyncConfig,
    remote: R,
    progress_sink: P,
    status_sink: S,
) -> ContinuousSyncHandle
where
    R: SyncRemoteClient + Send + Sync + 'static,
    P: SyncProgressSink + Send + Sync + 'static,
    S: ContinuousSyncStatusSink + Send + Sync + 'static,
{
    let (command_tx, command_rx) = mpsc::unbounded_channel();
    let status = Arc::new(Mutex::new(ContinuousSyncStatusEvent::idle()));
    let handle = ContinuousSyncHandle::new(command_tx.clone(), Arc::clone(&status));
    let startup_sync = continuous_config.startup_sync;
    let next_poll_at = Instant::now() + continuous_config.remote_poll_duration();
    let next_backoff_delay = continuous_config.retry_min_duration();

    let session = ContinuousSyncSession {
        config,
        continuous_config,
        remote,
        progress_sink,
        status_sink,
        command_rx,
        shared_status: status,
        journal: SuppressionJournal::default(),
        local_dirty_paths: BTreeSet::new(),
        requires_full_scan: false,
        force_run: false,
        scheduled_run_at: None,
        backoff_until: None,
        next_poll_at,
        next_backoff_delay,
        paused_reason: None,
        stopped: false,
    };

    tokio::spawn(session.run());

    if startup_sync {
        let _ = handle.submit_trigger(ContinuousSyncTrigger::Startup);
    }

    handle
}

struct ContinuousSyncSession<R, P, S>
where
    R: SyncRemoteClient + Send + Sync + 'static,
    P: SyncProgressSink + Send + Sync + 'static,
    S: ContinuousSyncStatusSink + Send + Sync + 'static,
{
    config: SyncRuntimeConfig,
    continuous_config: ContinuousSyncConfig,
    remote: R,
    progress_sink: P,
    status_sink: S,
    command_rx: mpsc::UnboundedReceiver<SessionCommand>,
    shared_status: Arc<Mutex<ContinuousSyncStatusEvent>>,
    journal: SuppressionJournal,
    local_dirty_paths: BTreeSet<String>,
    requires_full_scan: bool,
    force_run: bool,
    scheduled_run_at: Option<Instant>,
    backoff_until: Option<Instant>,
    next_poll_at: Instant,
    next_backoff_delay: Duration,
    paused_reason: Option<ContinuousSyncPauseReason>,
    stopped: bool,
}

impl<R, P, S> ContinuousSyncSession<R, P, S>
where
    R: SyncRemoteClient + Send + Sync + 'static,
    P: SyncProgressSink + Send + Sync + 'static,
    S: ContinuousSyncStatusSink + Send + Sync + 'static,
{
    async fn run(mut self) {
        self.next_poll_at = Instant::now() + self.continuous_config.remote_poll_duration();
        self.next_backoff_delay = self.continuous_config.retry_min_duration();

        loop {
            self.drain_commands(false);
            if self.stopped {
                break;
            }

            let now = Instant::now();
            if now >= self.next_poll_at {
                self.next_poll_at = now + self.continuous_config.remote_poll_duration();
                if self.paused_reason.is_none() {
                    self.force_run = true;
                    if self.backoff_until.is_none() {
                        self.scheduled_run_at = Some(now);
                    }
                }
            }

            if self
                .backoff_until
                .is_some_and(|retry_deadline| retry_deadline <= now)
            {
                self.backoff_until = None;
                self.scheduled_run_at = Some(now);
            }

            if self.should_run(now) {
                self.run_once().await;
                self.next_poll_at = Instant::now() + self.continuous_config.remote_poll_duration();
                self.drain_commands(true);
                continue;
            }

            let next_deadline = self.next_deadline();
            tokio::select! {
                command = self.command_rx.recv() => {
                    match command {
                        Some(command) => self.handle_command(command, false),
                        None => {
                            self.stopped = true;
                        }
                    }
                }
                _ = sleep_until(next_deadline) => {}
            }
        }

        self.journal.clear_workspace();
        self.emit_status(ContinuousSyncStatusEvent {
            status: ContinuousSyncStatus::Stopped,
            reason: None,
            next_attempt_at_unix_ms: None,
            last_error: None,
        });
    }

    fn drain_commands(&mut self, immediate_local_triggers: bool) {
        loop {
            match self.command_rx.try_recv() {
                Ok(command) => self.handle_command(command, immediate_local_triggers),
                Err(mpsc::error::TryRecvError::Empty) => break,
                Err(mpsc::error::TryRecvError::Disconnected) => {
                    self.stopped = true;
                    break;
                }
            }
        }
    }

    fn handle_command(&mut self, command: SessionCommand, immediate_local_triggers: bool) {
        match command {
            SessionCommand::Stop => {
                self.stopped = true;
            }
            SessionCommand::Trigger(trigger) => {
                self.handle_trigger(trigger, immediate_local_triggers);
            }
        }
    }

    fn handle_trigger(&mut self, trigger: ContinuousSyncTrigger, immediate_local_triggers: bool) {
        let now = Instant::now();

        match trigger {
            ContinuousSyncTrigger::Startup
            | ContinuousSyncTrigger::Manual
            | ContinuousSyncTrigger::RemotePoll => {
                if self.paused_reason.is_some() && !matches!(trigger, ContinuousSyncTrigger::Manual)
                {
                    return;
                }

                if matches!(trigger, ContinuousSyncTrigger::Manual) {
                    self.paused_reason = None;
                    self.backoff_until = None;
                    self.next_backoff_delay = self.continuous_config.retry_min_duration();
                }

                self.force_run = true;
                self.schedule_run(now, true);
            }
            ContinuousSyncTrigger::LocalChanges {
                rel_paths,
                requires_full_scan,
            } => {
                if self.paused_reason.is_some() {
                    return;
                }

                let external_rel_paths = if requires_full_scan {
                    rel_paths
                        .into_iter()
                        .map(normalize_rel_path)
                        .filter(|path| !path.is_empty())
                        .collect::<Vec<_>>()
                } else {
                    self.journal.classify_rel_paths(&rel_paths, now)
                };

                if external_rel_paths.is_empty() && !requires_full_scan {
                    return;
                }

                self.local_dirty_paths.extend(external_rel_paths);
                self.requires_full_scan |= requires_full_scan;

                if self.backoff_until.is_none() || immediate_local_triggers {
                    self.schedule_run(now, immediate_local_triggers);
                }
            }
        }
    }

    fn schedule_run(&mut self, now: Instant, immediate: bool) {
        let scheduled_at = if immediate {
            now
        } else {
            now + self.continuous_config.debounce_duration()
        };

        self.scheduled_run_at = Some(match self.scheduled_run_at {
            Some(existing) if existing <= scheduled_at => existing,
            _ => scheduled_at,
        });

        if self.backoff_until.is_none() {
            self.emit_status(ContinuousSyncStatusEvent {
                status: ContinuousSyncStatus::Scheduled,
                reason: None,
                next_attempt_at_unix_ms: Some(unix_ms_after(
                    self.scheduled_run_at
                        .expect("scheduled run timestamp")
                        .saturating_duration_since(Instant::now()),
                )),
                last_error: None,
            });
        }
    }

    fn should_run(&self, now: Instant) -> bool {
        self.paused_reason.is_none()
            && self.backoff_until.is_none()
            && self
                .scheduled_run_at
                .is_some_and(|scheduled_at| scheduled_at <= now)
            && (self.force_run || self.requires_full_scan || !self.local_dirty_paths.is_empty())
    }

    fn next_deadline(&self) -> Instant {
        let mut deadline = self.next_poll_at;
        if let Some(scheduled_run_at) = self.scheduled_run_at {
            deadline = deadline.min(scheduled_run_at);
        }
        if let Some(backoff_until) = self.backoff_until {
            deadline = deadline.min(backoff_until);
        }
        deadline
    }

    async fn run_once(&mut self) {
        self.scheduled_run_at = None;
        self.emit_status(ContinuousSyncStatusEvent {
            status: ContinuousSyncStatus::Syncing,
            reason: None,
            next_attempt_at_unix_ms: None,
            last_error: None,
        });

        let result = run_sync_attempt(
            &self.config,
            &self.continuous_config,
            &self.remote,
            &self.progress_sink,
        )
        .await;

        match result {
            Ok(success) => {
                self.register_pull_mutations(&success.pull_mutated_rel_paths);
                self.local_dirty_paths.clear();
                self.requires_full_scan = false;
                self.force_run = false;
                self.backoff_until = None;
                self.next_backoff_delay = self.continuous_config.retry_min_duration();
                self.emit_status(ContinuousSyncStatusEvent::idle());
            }
            Err(failure) => {
                self.register_pull_mutations(&failure.pull_mutated_rel_paths);

                match failure.action {
                    RunFailureAction::Backoff => {
                        let retry_delay = self.next_backoff_delay;
                        self.backoff_until = Some(Instant::now() + retry_delay);
                        self.force_run = true;
                        self.next_backoff_delay = next_backoff_delay(
                            retry_delay,
                            self.continuous_config.retry_max_duration(),
                        );
                        self.emit_status(ContinuousSyncStatusEvent {
                            status: ContinuousSyncStatus::Backoff,
                            reason: None,
                            next_attempt_at_unix_ms: Some(unix_ms_after(retry_delay)),
                            last_error: Some(failure.message),
                        });
                    }
                    RunFailureAction::Pause(reason) => {
                        self.paused_reason = Some(reason.clone());
                        self.backoff_until = None;
                        self.next_backoff_delay = self.continuous_config.retry_min_duration();
                        self.emit_status(ContinuousSyncStatusEvent {
                            status: ContinuousSyncStatus::Paused,
                            reason: Some(reason),
                            next_attempt_at_unix_ms: None,
                            last_error: Some(failure.message),
                        });
                    }
                }
            }
        }
    }

    fn register_pull_mutations(&mut self, rel_paths: &[String]) {
        if rel_paths.is_empty() {
            return;
        }

        let now = Instant::now();
        let ttl = self.continuous_config.suppression_ttl_duration();
        for rel_path in rel_paths {
            self.journal.register_exact(rel_path, ttl, now);
            self.journal.register_subtree(rel_path, ttl, now);
        }
    }

    fn emit_status(&mut self, next_event: ContinuousSyncStatusEvent) {
        let mut current = self
            .shared_status
            .lock()
            .expect("continuous sync status lock");
        if *current == next_event {
            return;
        }

        *current = next_event.clone();
        drop(current);
        self.status_sink.emit(next_event);
    }
}

fn normalize_rel_path(path: String) -> String {
    path.trim()
        .replace('\\', "/")
        .trim_start_matches("./")
        .trim_end_matches('/')
        .to_string()
}

fn next_backoff_delay(current: Duration, max: Duration) -> Duration {
    let current_ms = current.as_millis() as u64;
    let next_ms = current_ms.saturating_mul(2).min(max.as_millis() as u64);
    Duration::from_millis(next_ms.max(1))
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use async_trait::async_trait;
    use sync_client::{
        CreateRemoteCommitInput, CreateRemoteCommitResult, CreateRemoteVaultResult,
        RemoteBlobEnvelope, RemoteCommitRecord, RemoteContext, SyncClientError, SyncProgressEvent,
        SyncProgressSink, SyncRemoteClient, SyncRemoteHead, UploadRemoteBlobInput,
        UploadRemoteBlobResult,
    };

    use crate::{
        start_continuous_sync_session, ContinuousSyncConfig, ContinuousSyncPauseReason,
        ContinuousSyncStatus, ContinuousSyncStatusEvent, ContinuousSyncStatusSink,
        ContinuousSyncTrigger, SyncIdentityConfig, SyncPathsConfig, SyncRuntimeConfig,
        SyncServerConfig,
    };

    use super::super::types::now_unix_ms;
    use super::*;

    #[derive(Debug, Default, Clone)]
    struct RecordingProgressSink;

    impl SyncProgressSink for RecordingProgressSink {
        fn emit(&self, _event: SyncProgressEvent) -> Result<(), SyncClientError> {
            Ok(())
        }
    }

    #[derive(Debug, Default, Clone)]
    struct RecordingStatusSink {
        events: Arc<Mutex<Vec<ContinuousSyncStatusEvent>>>,
    }

    impl ContinuousSyncStatusSink for RecordingStatusSink {
        fn emit(&self, event: ContinuousSyncStatusEvent) {
            self.events.lock().expect("status events lock").push(event);
        }
    }

    #[derive(Debug, Clone)]
    struct MockRemote {
        head_results: Arc<Mutex<Vec<Result<Option<String>, SyncClientError>>>>,
        head_calls: Arc<Mutex<usize>>,
    }

    impl MockRemote {
        fn new(head_results: Vec<Result<Option<String>, SyncClientError>>) -> Self {
            Self {
                head_results: Arc::new(Mutex::new(head_results)),
                head_calls: Arc::new(Mutex::new(0)),
            }
        }

        fn head_calls(&self) -> usize {
            *self.head_calls.lock().expect("head calls lock")
        }
    }

    #[async_trait]
    impl SyncRemoteClient for MockRemote {
        async fn create_vault(
            &self,
            _context: &RemoteContext,
            vault_id: &str,
            _current_key_version: Option<i64>,
        ) -> Result<CreateRemoteVaultResult, SyncClientError> {
            Ok(CreateRemoteVaultResult {
                vault_id: vault_id.to_string(),
                current_head_commit_id: None,
                current_key_version: 1,
                created: false,
            })
        }

        async fn get_head(
            &self,
            _context: &RemoteContext,
            vault_id: &str,
        ) -> Result<SyncRemoteHead, SyncClientError> {
            *self.head_calls.lock().expect("head calls lock") += 1;
            let result = self
                .head_results
                .lock()
                .expect("head results lock")
                .remove(0);

            result.map(|current_head_commit_id| SyncRemoteHead {
                vault_id: vault_id.to_string(),
                current_head_commit_id,
                current_key_version: 1,
                role: "owner".to_string(),
                membership_status: "active".to_string(),
            })
        }

        async fn upload_blob(
            &self,
            _context: &RemoteContext,
            _vault_id: &str,
            input: UploadRemoteBlobInput,
        ) -> Result<UploadRemoteBlobResult, SyncClientError> {
            Ok(UploadRemoteBlobResult {
                vault_id: "vault-1".to_string(),
                blob_id: input.blob_id,
                kind: input.kind,
                existed: false,
            })
        }

        async fn get_blob(
            &self,
            _context: &RemoteContext,
            _vault_id: &str,
            blob_id: &str,
        ) -> Result<RemoteBlobEnvelope, SyncClientError> {
            Ok(RemoteBlobEnvelope {
                vault_id: "vault-1".to_string(),
                blob_id: blob_id.to_string(),
                kind: "file".to_string(),
                ciphertext_hash: blob_id.to_string(),
                ciphertext_base64: String::new(),
                nonce_base64: String::new(),
                ciphertext_size: 0,
            })
        }

        async fn create_commit(
            &self,
            _context: &RemoteContext,
            _vault_id: &str,
            _input: CreateRemoteCommitInput,
        ) -> Result<CreateRemoteCommitResult, SyncClientError> {
            Ok(CreateRemoteCommitResult {
                vault_id: "vault-1".to_string(),
                commit_id: "commit-1".to_string(),
                current_head_commit_id: "commit-1".to_string(),
                current_key_version: 1,
            })
        }

        async fn get_commit(
            &self,
            _context: &RemoteContext,
            _vault_id: &str,
            commit_id: &str,
        ) -> Result<RemoteCommitRecord, SyncClientError> {
            Ok(RemoteCommitRecord {
                vault_id: "vault-1".to_string(),
                commit_id: commit_id.to_string(),
                base_commit_id: None,
                manifest_blob_id: "manifest".to_string(),
                manifest_ciphertext_hash: "manifest".to_string(),
                created_by_user_id: "user-1".to_string(),
                created_by_device_id: "device-1".to_string(),
                key_version: 1,
                signature: "sig".to_string(),
                created_at: now_unix_ms() as i64,
            })
        }
    }

    fn runtime_config() -> SyncRuntimeConfig {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let temp_root = std::env::temp_dir().join(format!("sync-runtime-session-{unique}"));
        std::fs::create_dir_all(&temp_root).expect("temp root");
        let workspace_root = temp_root.join("workspace");
        std::fs::create_dir_all(&workspace_root).expect("workspace root");
        let db_path = temp_root.join("app.sqlite");
        app_storage::migrations::run_migrations_at(&db_path).expect("migrations");

        SyncRuntimeConfig {
            session_id: 1,
            paths: SyncPathsConfig {
                workspace_root,
                db_path,
            },
            server: SyncServerConfig {
                server_url: "https://sync.mdit.app".to_string(),
                vault_id: "vault-1".to_string(),
                auth_token: "token".to_string(),
                user_id: "user-1".to_string(),
            },
            identity: SyncIdentityConfig {
                device_id: Some("device-1".to_string()),
                vault_key_hex: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
                    .to_string(),
            },
            max_file_size_bytes: None,
        }
    }

    async fn settle() {
        for _ in 0..4 {
            tokio::task::yield_now().await;
        }
    }

    async fn wait_for_status(
        handle: &ContinuousSyncHandle,
        target: ContinuousSyncStatus,
    ) -> ContinuousSyncStatusEvent {
        for _ in 0..64 {
            let current = handle.current_status();
            if current.status == target {
                return current;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }

        panic!(
            "timed out waiting for status {:?}, current = {:?}",
            target,
            handle.current_status()
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn session_starts_and_schedules_initial_sync() {
        let remote = MockRemote::new(vec![Ok(None), Ok(None)]);
        let status_sink = RecordingStatusSink::default();
        let handle = start_continuous_sync_session(
            runtime_config(),
            ContinuousSyncConfig::default(),
            remote.clone(),
            RecordingProgressSink,
            status_sink.clone(),
        );

        tokio::time::sleep(Duration::from_millis(20)).await;

        assert_eq!(remote.head_calls(), 2);
        let current = handle.current_status().status;
        assert!(matches!(
            current,
            ContinuousSyncStatus::Syncing | ContinuousSyncStatus::Idle
        ));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn local_changes_are_debounced_into_one_run() {
        let remote = MockRemote::new(vec![Ok(None), Ok(None)]);
        let handle = start_continuous_sync_session(
            runtime_config(),
            ContinuousSyncConfig {
                debounce_ms: 20,
                startup_sync: false,
                ..ContinuousSyncConfig::default()
            },
            remote.clone(),
            RecordingProgressSink,
            RecordingStatusSink::default(),
        );

        handle
            .submit_trigger(ContinuousSyncTrigger::LocalChanges {
                rel_paths: vec!["a.md".to_string()],
                requires_full_scan: false,
            })
            .expect("submit local changes");
        handle
            .submit_trigger(ContinuousSyncTrigger::LocalChanges {
                rel_paths: vec!["b.md".to_string()],
                requires_full_scan: false,
            })
            .expect("submit local changes");

        settle().await;
        tokio::time::sleep(Duration::from_millis(40)).await;

        assert_eq!(remote.head_calls(), 2);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn manual_trigger_recovers_paused_session() {
        let remote = MockRemote::new(vec![
            Err(SyncClientError::remote("UNAUTHORIZED", "unauthorized")),
            Ok(None),
            Ok(None),
        ]);
        let handle = start_continuous_sync_session(
            runtime_config(),
            ContinuousSyncConfig {
                retry_min_ms: 20,
                retry_max_ms: 20,
                startup_sync: false,
                ..ContinuousSyncConfig::default()
            },
            remote,
            RecordingProgressSink,
            RecordingStatusSink::default(),
        );

        handle
            .submit_trigger(ContinuousSyncTrigger::Manual)
            .expect("submit manual trigger");
        let paused = wait_for_status(&handle, ContinuousSyncStatus::Paused).await;
        assert_eq!(paused.reason, Some(ContinuousSyncPauseReason::Unauthorized));

        handle
            .submit_trigger(ContinuousSyncTrigger::Manual)
            .expect("submit retry");
        wait_for_status(&handle, ContinuousSyncStatus::Idle).await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn backoff_retries_after_remote_error() {
        let remote = MockRemote::new(vec![
            Err(SyncClientError::remote(
                "AUTH_SERVICE_UNAVAILABLE",
                "temporary",
            )),
            Ok(None),
            Ok(None),
        ]);
        let handle = start_continuous_sync_session(
            runtime_config(),
            ContinuousSyncConfig {
                retry_min_ms: 20,
                retry_max_ms: 20,
                startup_sync: false,
                ..ContinuousSyncConfig::default()
            },
            remote,
            RecordingProgressSink,
            RecordingStatusSink::default(),
        );

        handle
            .submit_trigger(ContinuousSyncTrigger::Manual)
            .expect("submit manual trigger");
        wait_for_status(&handle, ContinuousSyncStatus::Backoff).await;

        tokio::time::sleep(Duration::from_millis(30)).await;
        wait_for_status(&handle, ContinuousSyncStatus::Idle).await;
    }
}
