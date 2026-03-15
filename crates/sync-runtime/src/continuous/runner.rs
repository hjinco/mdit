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
    let mut pull_mutated_rel_paths = Vec::new();

    for _ in 0..=continuous_config.max_head_conflict_retries {
        let pull_result = pull_workspace(config, remote, progress_sink)
            .await
            .map_err(|error| classify_runtime_error(error, pull_mutated_rel_paths.clone()))?;
        if let Some(mutated) = pull_result.mutated_rel_paths {
            pull_mutated_rel_paths = mutated;
        }

        match push_workspace(config, remote, progress_sink).await {
            Ok(push_result) => {
                return Ok(RunSuccess {
                    pull_mutated_rel_paths,
                    push_outcome: push_result.outcome,
                });
            }
            Err(SyncRuntimeError::SyncClient(SyncClientError::HeadConflict { .. })) => continue,
            Err(error) => {
                return Err(classify_runtime_error(
                    error,
                    pull_mutated_rel_paths.clone(),
                ))
            }
        }
    }

    Err(RunFailure {
        action: RunFailureAction::Backoff,
        message: "Remote head changed before sync".to_string(),
        pull_mutated_rel_paths,
    })
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
