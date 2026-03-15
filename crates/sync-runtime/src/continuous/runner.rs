use std::{collections::BTreeSet, future::Future};

use sync_client::{PushWorkspaceOutcome, SyncClientError};

use crate::{
    sync::{pull_workspace, push_workspace},
    SyncRuntimeConfig, SyncRuntimeError,
};

use super::types::ContinuousSyncPauseReason;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum RunFailureAction {
    Backoff,
    Pause(ContinuousSyncPauseReason),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RunFailure {
    pub(crate) action: RunFailureAction,
    pub(crate) message: String,
    pub(crate) pull_mutated_rel_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RunSuccess {
    pub(crate) pull_mutated_rel_paths: Vec<String>,
    pub(crate) push_outcome: PushWorkspaceOutcome,
}

pub(crate) async fn run_sync_attempt(
    config: &SyncRuntimeConfig,
    continuous_config: &super::types::ContinuousSyncConfig,
    remote: &(impl sync_client::SyncRemoteClient + Send + Sync),
    progress_sink: &(impl sync_client::SyncProgressSink + Send + Sync),
) -> Result<RunSuccess, RunFailure> {
    run_sync_attempt_with_ops(
        continuous_config,
        || pull_workspace(config, remote, progress_sink),
        || push_workspace(config, remote, progress_sink),
    )
    .await
}

pub(crate) fn classify_runtime_error(
    error: SyncRuntimeError,
    pull_mutated_rel_paths: Vec<String>,
) -> RunFailure {
    match error {
        SyncRuntimeError::MissingDeviceId => RunFailure {
            action: RunFailureAction::Pause(ContinuousSyncPauseReason::MissingDeviceId),
            message: "push configuration requires a device_id".to_string(),
            pull_mutated_rel_paths,
        },
        SyncRuntimeError::SessionClosed => RunFailure {
            action: RunFailureAction::Backoff,
            message: "continuous sync session is closed".to_string(),
            pull_mutated_rel_paths,
        },
        SyncRuntimeError::SyncClient(SyncClientError::Local { message }) => RunFailure {
            action: RunFailureAction::Pause(ContinuousSyncPauseReason::LocalFailure),
            message,
            pull_mutated_rel_paths,
        },
        SyncRuntimeError::SyncClient(SyncClientError::HeadConflict { .. }) => RunFailure {
            action: RunFailureAction::Backoff,
            message: "Remote head changed before sync".to_string(),
            pull_mutated_rel_paths,
        },
        SyncRuntimeError::SyncClient(SyncClientError::Remote { code, message, .. }) => {
            let action = match code.as_str() {
                "UNAUTHORIZED" => RunFailureAction::Pause(ContinuousSyncPauseReason::Unauthorized),
                "FORBIDDEN" => RunFailureAction::Pause(ContinuousSyncPauseReason::Forbidden),
                "NOT_FOUND" => RunFailureAction::Pause(ContinuousSyncPauseReason::NotFound),
                "INVALID_BLOB_ID"
                | "INVALID_BLOB_SIZE"
                | "MANIFEST_BLOB_NOT_FOUND"
                | "BLOB_OBJECT_NOT_FOUND" => {
                    RunFailureAction::Pause(ContinuousSyncPauseReason::InvalidRemoteState)
                }
                "AUTH_SERVICE_UNAVAILABLE" | "INTERNAL_ERROR" => RunFailureAction::Backoff,
                _ => RunFailureAction::Backoff,
            };

            RunFailure {
                action,
                message,
                pull_mutated_rel_paths,
            }
        }
    }
}

async fn run_sync_attempt_with_ops<Pull, Push, PullFut, PushFut>(
    continuous_config: &super::types::ContinuousSyncConfig,
    mut pull_once: Pull,
    mut push_once: Push,
) -> Result<RunSuccess, RunFailure>
where
    Pull: FnMut() -> PullFut,
    Push: FnMut() -> PushFut,
    PullFut: Future<Output = Result<sync_client::PullWorkspaceResult, SyncRuntimeError>>,
    PushFut: Future<Output = Result<sync_client::PushWorkspaceResult, SyncRuntimeError>>,
{
    let mut pull_mutated_rel_paths = BTreeSet::new();

    for _ in 0..=continuous_config.max_head_conflict_retries {
        let pull_result = pull_once().await.map_err(|error| {
            classify_runtime_error(error, pull_mutated_rel_paths_vec(&pull_mutated_rel_paths))
        })?;
        if let Some(mutated) = pull_result.mutated_rel_paths {
            pull_mutated_rel_paths.extend(mutated);
        }

        match push_once().await {
            Ok(push_result) => {
                return Ok(RunSuccess {
                    pull_mutated_rel_paths: pull_mutated_rel_paths_vec(&pull_mutated_rel_paths),
                    push_outcome: push_result.outcome,
                });
            }
            Err(SyncRuntimeError::SyncClient(SyncClientError::HeadConflict { .. })) => continue,
            Err(error) => {
                return Err(classify_runtime_error(
                    error,
                    pull_mutated_rel_paths_vec(&pull_mutated_rel_paths),
                ))
            }
        }
    }

    Err(RunFailure {
        action: RunFailureAction::Backoff,
        message: "Remote head changed before sync".to_string(),
        pull_mutated_rel_paths: pull_mutated_rel_paths_vec(&pull_mutated_rel_paths),
    })
}

fn pull_mutated_rel_paths_vec(paths: &BTreeSet<String>) -> Vec<String> {
    paths.iter().cloned().collect()
}

#[cfg(test)]
mod tests {
    use std::{
        future,
        sync::{Arc, Mutex},
    };

    use sync_client::{PullWorkspaceOutcome, PullWorkspaceResult, PushWorkspaceResult};
    use sync_engine::{LocalSyncManifest, SyncVaultState};

    use super::*;

    #[tokio::test]
    async fn accumulates_pull_mutations_across_head_conflict_retries() {
        let pull_results = Arc::new(Mutex::new(vec![
            Ok(PullWorkspaceResult {
                outcome: PullWorkspaceOutcome::Applied,
                sync_vault_state: None,
                entries: None,
                exclusion_events: None,
                manifest: None,
                head_commit_id: Some("commit-1".to_string()),
                mutated_rel_paths: Some(vec!["notes/a.md".to_string()]),
                files_applied: Some(1),
                entries_deleted: Some(0),
            }),
            Ok(PullWorkspaceResult {
                outcome: PullWorkspaceOutcome::AlreadyUpToDate,
                sync_vault_state: None,
                entries: None,
                exclusion_events: None,
                manifest: None,
                head_commit_id: Some("commit-1".to_string()),
                mutated_rel_paths: None,
                files_applied: Some(0),
                entries_deleted: Some(0),
            }),
        ]));
        let push_results = Arc::new(Mutex::new(vec![
            Err(SyncRuntimeError::SyncClient(
                SyncClientError::HeadConflict {
                    current_head_commit_id: Some("commit-2".to_string()),
                },
            )),
            Ok(PushWorkspaceResult {
                outcome: PushWorkspaceOutcome::NoChanges,
                sync_vault_state: sync_vault_state(),
                entries: Vec::new(),
                exclusion_events: Vec::new(),
                manifest: manifest(),
                commit: None,
                uploaded_blob_count: 0,
            }),
        ]));

        let result = run_sync_attempt_with_ops(
            &super::super::types::ContinuousSyncConfig {
                max_head_conflict_retries: 1,
                ..Default::default()
            },
            {
                let pull_results = Arc::clone(&pull_results);
                move || future::ready(pull_results.lock().expect("pull results lock").remove(0))
            },
            {
                let push_results = Arc::clone(&push_results);
                move || future::ready(push_results.lock().expect("push results lock").remove(0))
            },
        )
        .await
        .expect("sync attempt should succeed");

        assert_eq!(
            result.pull_mutated_rel_paths,
            vec!["notes/a.md".to_string()]
        );
        assert_eq!(result.push_outcome, PushWorkspaceOutcome::NoChanges);
    }

    fn sync_vault_state() -> SyncVaultState {
        SyncVaultState {
            vault_id: 1,
            remote_vault_id: Some("vault-1".to_string()),
            last_synced_commit_id: Some("commit-1".to_string()),
            current_key_version: 1,
            last_remote_head_seen: Some("commit-1".to_string()),
            last_scan_at: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn manifest() -> LocalSyncManifest {
        LocalSyncManifest {
            manifest_version: 1,
            vault_id: 1,
            base_commit_id: Some("commit-1".to_string()),
            generated_at: String::new(),
            entries: Vec::new(),
        }
    }
}
