use sync_client::{
    pull_workspace as pull_workspace_with_store, push_workspace as push_workspace_with_store,
    PullWorkspaceResult, PushWorkspaceResult, SyncProgressSink, SyncRemoteClient,
};

use crate::{store::AppStorageSyncStore, SyncRuntimeConfig, SyncRuntimeError};

pub async fn push_workspace(
    config: &SyncRuntimeConfig,
    remote: &impl SyncRemoteClient,
    progress_sink: &impl SyncProgressSink,
) -> Result<PushWorkspaceResult, SyncRuntimeError> {
    let input = config.to_push_input()?;
    let store = AppStorageSyncStore::new(
        config.paths.db_path.clone(),
        config.paths.workspace_root.clone(),
    );
    push_workspace_with_store(input, store, remote, progress_sink)
        .await
        .map_err(SyncRuntimeError::from)
}

pub async fn pull_workspace(
    config: &SyncRuntimeConfig,
    remote: &impl SyncRemoteClient,
    progress_sink: &impl SyncProgressSink,
) -> Result<PullWorkspaceResult, SyncRuntimeError> {
    let input = config.to_pull_input();
    let store = AppStorageSyncStore::new(
        config.paths.db_path.clone(),
        config.paths.workspace_root.clone(),
    );
    pull_workspace_with_store(input, store, remote, progress_sink)
        .await
        .map_err(SyncRuntimeError::from)
}
