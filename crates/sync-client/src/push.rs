use sync_engine::{
    finalize_push_workspace, prepare_push_workspace, FinalizePushInput, ScanOptions,
    SyncWorkspaceStore,
};
use tokio::task;
use uuid::Uuid;

use crate::{
    error::SyncClientError,
    helpers::{build_remote_context, emit_progress, now_unix_ms},
    traits::{SyncProgressSink, SyncRemoteClient},
    types::{
        CreateRemoteCommitInput, PushWorkspaceInput, PushWorkspaceResult, SyncDirection, SyncPhase,
        UploadRemoteBlobInput,
    },
};

pub async fn push_workspace<S>(
    input: PushWorkspaceInput,
    store: S,
    remote: &impl SyncRemoteClient,
    progress_sink: &impl SyncProgressSink,
) -> Result<PushWorkspaceResult, SyncClientError>
where
    S: SyncWorkspaceStore + Clone + Send + Sync + 'static,
{
    let remote_context = build_remote_context(
        input.server_url.clone(),
        input.auth_token.clone(),
        input.user_id.clone(),
    );

    emit_progress(
        progress_sink,
        input.session_id,
        &input.workspace_root,
        SyncDirection::Push,
        SyncPhase::Starting,
        None,
        None,
    )?;
    emit_progress(
        progress_sink,
        input.session_id,
        &input.workspace_root,
        SyncDirection::Push,
        SyncPhase::Scanning,
        None,
        None,
    )?;

    let workspace_root = input.workspace_root.clone();
    let vault_key_hex = input.vault_key_hex.clone();
    let max_file_size_bytes = input.max_file_size_bytes;
    let store_for_prepare = store.clone();
    let prepared = task::spawn_blocking(move || {
        prepare_push_workspace(
            &workspace_root,
            &store_for_prepare,
            &vault_key_hex,
            ScanOptions {
                max_file_size_bytes,
            },
        )
    })
    .await
    .map_err(|error| SyncClientError::local(error.to_string()))??;

    remote
        .create_vault(
            &remote_context,
            &input.vault_id,
            Some(prepared.sync_vault_state.current_key_version.max(1)),
        )
        .await?;

    let head = remote.get_head(&remote_context, &input.vault_id).await?;
    let base_commit_id = prepared.sync_vault_state.last_synced_commit_id.clone();
    if head.current_head_commit_id != base_commit_id {
        return Err(SyncClientError::HeadConflict {
            current_head_commit_id: head.current_head_commit_id,
        });
    }

    let total_uploads = prepared.file_blobs.len() + 1;
    for (index, file_blob) in prepared.file_blobs.iter().enumerate() {
        emit_progress(
            progress_sink,
            input.session_id,
            &input.workspace_root,
            SyncDirection::Push,
            SyncPhase::Uploading,
            Some(index),
            Some(total_uploads),
        )?;
        remote
            .upload_blob(
                &remote_context,
                &input.vault_id,
                UploadRemoteBlobInput {
                    blob_id: file_blob.blob_id.clone(),
                    kind: file_blob.kind.clone(),
                    ciphertext_hash: file_blob.ciphertext_hash.clone(),
                    ciphertext_base64: file_blob.ciphertext_base64.clone(),
                    nonce_base64: file_blob.nonce_base64.clone(),
                    ciphertext_size: file_blob.ciphertext_size,
                },
            )
            .await?;
    }

    emit_progress(
        progress_sink,
        input.session_id,
        &input.workspace_root,
        SyncDirection::Push,
        SyncPhase::Uploading,
        Some(prepared.file_blobs.len()),
        Some(total_uploads),
    )?;
    remote
        .upload_blob(
            &remote_context,
            &input.vault_id,
            UploadRemoteBlobInput {
                blob_id: prepared.manifest_blob.blob_id.clone(),
                kind: prepared.manifest_blob.kind.clone(),
                ciphertext_hash: prepared.manifest_blob.ciphertext_hash.clone(),
                ciphertext_base64: prepared.manifest_blob.ciphertext_base64.clone(),
                nonce_base64: prepared.manifest_blob.nonce_base64.clone(),
                ciphertext_size: prepared.manifest_blob.ciphertext_size,
            },
        )
        .await?;

    emit_progress(
        progress_sink,
        input.session_id,
        &input.workspace_root,
        SyncDirection::Push,
        SyncPhase::Committing,
        None,
        None,
    )?;

    let created_at = now_unix_ms()?;
    let commit = remote
        .create_commit(
            &remote_context,
            &input.vault_id,
            CreateRemoteCommitInput {
                commit_id: Uuid::new_v4().to_string(),
                base_commit_id,
                manifest_blob_id: prepared.manifest_blob.blob_id.clone(),
                manifest_ciphertext_hash: prepared.manifest_blob.ciphertext_hash.clone(),
                created_by_device_id: input.device_id.clone(),
                key_version: prepared.sync_vault_state.current_key_version.max(1),
                signature: format!("bootstrap-signature:{}:{}", input.device_id, created_at),
                created_at,
            },
        )
        .await?;

    let current_head_commit_id = commit.current_head_commit_id.clone();
    let current_key_version = commit.current_key_version;
    let store_for_persist = store.clone();
    let prepared_for_finalize = prepared.clone();
    let vault_id = input.vault_id.clone();
    let (sync_vault_state, entries, exclusion_events) = task::spawn_blocking(move || {
        let finalized = finalize_push_workspace(
            &store_for_persist,
            &prepared_for_finalize,
            &FinalizePushInput {
                remote_vault_id: vault_id,
                last_synced_commit_id: current_head_commit_id,
                current_key_version,
            },
        )?;
        Ok::<_, anyhow::Error>((
            finalized.sync_vault_state,
            finalized.entries,
            finalized.exclusion_events,
        ))
    })
    .await
    .map_err(|error| SyncClientError::local(error.to_string()))??;

    emit_progress(
        progress_sink,
        input.session_id,
        &input.workspace_root,
        SyncDirection::Push,
        SyncPhase::Finished,
        Some(total_uploads),
        Some(total_uploads),
    )?;

    Ok(PushWorkspaceResult {
        sync_vault_state,
        entries,
        exclusion_events,
        manifest: prepared.manifest,
        commit,
        uploaded_blob_count: total_uploads,
    })
}
