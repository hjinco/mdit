use std::collections::HashMap;

use sync_engine::{
    apply_remote_workspace, decrypt_file_blob, decrypt_manifest_blob, ApplyRemoteSyncFileInput,
    ApplyRemoteWorkspaceInput, DecryptFileBlobInput, DecryptManifestBlobInput, LocalSyncManifest,
    LocalSyncManifestEntry, SyncWorkspaceStore,
};
use tokio::task;

use crate::{
    error::SyncClientError,
    helpers::{
        build_remote_context, emit_progress, ensure_decrypted_file_matches_content_hash,
        ensure_remote_blob_envelope, ensure_remote_blob_matches,
    },
    traits::{SyncProgressSink, SyncRemoteClient},
    types::{
        PullWorkspaceInput, PullWorkspaceOutcome, PullWorkspaceResult, SyncDirection, SyncPhase,
    },
};

pub async fn pull_workspace<S>(
    input: PullWorkspaceInput,
    store: S,
    remote: &impl SyncRemoteClient,
    progress_sink: &impl SyncProgressSink,
) -> Result<PullWorkspaceResult, SyncClientError>
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
        SyncDirection::Pull,
        SyncPhase::Starting,
        None,
        None,
    )?;
    emit_progress(
        progress_sink,
        input.session_id,
        &input.workspace_root,
        SyncDirection::Pull,
        SyncPhase::Downloading,
        Some(0),
        None,
    )?;

    let store_for_touch = store.clone();
    let local_vault_state = task::spawn_blocking(move || store_for_touch.touch_sync_vault_state())
        .await
        .map_err(|error| SyncClientError::local(error.to_string()))??;
    let head = remote.get_head(&remote_context, &input.vault_id).await?;
    let Some(head_commit_id) = head.current_head_commit_id.clone() else {
        emit_progress(
            progress_sink,
            input.session_id,
            &input.workspace_root,
            SyncDirection::Pull,
            SyncPhase::Finished,
            Some(0),
            Some(0),
        )?;
        return Ok(PullWorkspaceResult {
            outcome: PullWorkspaceOutcome::EmptyRemote,
            sync_vault_state: None,
            entries: None,
            exclusion_events: None,
            manifest: None,
            head_commit_id: None,
            files_applied: None,
            entries_deleted: None,
        });
    };

    if head.current_head_commit_id == local_vault_state.last_synced_commit_id {
        emit_progress(
            progress_sink,
            input.session_id,
            &input.workspace_root,
            SyncDirection::Pull,
            SyncPhase::Finished,
            Some(0),
            Some(0),
        )?;
        return Ok(PullWorkspaceResult {
            outcome: PullWorkspaceOutcome::AlreadyUpToDate,
            sync_vault_state: Some(local_vault_state),
            entries: None,
            exclusion_events: None,
            manifest: None,
            head_commit_id: head.current_head_commit_id,
            files_applied: Some(0),
            entries_deleted: Some(0),
        });
    }

    let commit = remote
        .get_commit(&remote_context, &input.vault_id, &head_commit_id)
        .await?;
    let manifest_blob = remote
        .get_blob(&remote_context, &input.vault_id, &commit.manifest_blob_id)
        .await?;
    ensure_remote_blob_matches(
        &manifest_blob,
        &commit.manifest_blob_id,
        &commit.manifest_ciphertext_hash,
    )?;
    let manifest = decrypt_manifest_blob(DecryptManifestBlobInput {
        vault_key_hex: input.vault_key_hex.clone(),
        vault_id: local_vault_state.vault_id,
        kind: manifest_blob.kind.clone(),
        ciphertext_base64: manifest_blob.ciphertext_base64,
        nonce_base64: manifest_blob.nonce_base64,
    })?;
    let base_markdown_payloads = load_base_markdown_payloads(
        &input,
        remote,
        &remote_context,
        local_vault_state.vault_id,
        local_vault_state.last_synced_commit_id.as_deref(),
        &head_commit_id,
        &manifest,
    )
    .await?;

    let file_entries = manifest
        .entries
        .iter()
        .filter_map(|entry| match entry {
            sync_engine::LocalSyncManifestEntry::File {
                entry_id,
                parent_entry_id,
                name,
                blob_id,
                content_hash,
                size,
                modified_at,
            } => Some((
                entry_id.clone(),
                parent_entry_id.clone(),
                name.clone(),
                blob_id.clone(),
                content_hash.clone(),
                *size,
                *modified_at,
            )),
            sync_engine::LocalSyncManifestEntry::Dir { .. } => None,
        })
        .collect::<Vec<_>>();
    let total_files = file_entries.len();
    let mut files = Vec::with_capacity(total_files);
    let mut base_markdown_payloads = base_markdown_payloads;

    for (index, file_entry) in file_entries.into_iter().enumerate() {
        emit_progress(
            progress_sink,
            input.session_id,
            &input.workspace_root,
            SyncDirection::Pull,
            SyncPhase::Downloading,
            Some(index + 1),
            Some(total_files),
        )?;
        let remote_blob = remote
            .get_blob(&remote_context, &input.vault_id, &file_entry.3)
            .await?;
        ensure_remote_blob_envelope(&remote_blob, &file_entry.3)?;
        let decrypted = decrypt_file_blob(DecryptFileBlobInput {
            vault_key_hex: input.vault_key_hex.clone(),
            vault_id: local_vault_state.vault_id,
            kind: remote_blob.kind,
            ciphertext_base64: remote_blob.ciphertext_base64,
            nonce_base64: remote_blob.nonce_base64,
        })?;
        ensure_decrypted_file_matches_content_hash(&decrypted.plaintext_base64, &file_entry.4)?;

        let entry_id = file_entry.0;
        files.push(ApplyRemoteSyncFileInput {
            entry_id: entry_id.clone(),
            parent_entry_id: file_entry.1,
            name: file_entry.2,
            blob_id: file_entry.3,
            content_hash: file_entry.4,
            size: file_entry.5,
            modified_at: file_entry.6,
            plaintext_base64: decrypted.plaintext_base64,
            base_plaintext_base64: base_markdown_payloads.remove(&entry_id),
        });
    }

    emit_progress(
        progress_sink,
        input.session_id,
        &input.workspace_root,
        SyncDirection::Pull,
        SyncPhase::Applying,
        None,
        None,
    )?;

    let workspace_root = input.workspace_root.clone();
    let remote_vault_id = input.vault_id;
    let last_synced_commit_id = head_commit_id.clone();
    let current_key_version = head.current_key_version;
    let store_for_apply = store.clone();
    let applied = task::spawn_blocking(move || {
        apply_remote_workspace(
            &workspace_root,
            &store_for_apply,
            ApplyRemoteWorkspaceInput {
                manifest: manifest.clone(),
                files,
                remote_vault_id,
                last_synced_commit_id,
                current_key_version,
            },
        )
    })
    .await
    .map_err(|error| SyncClientError::local(error.to_string()))??;

    emit_progress(
        progress_sink,
        input.session_id,
        &input.workspace_root,
        SyncDirection::Pull,
        SyncPhase::Finished,
        Some(total_files),
        Some(total_files),
    )?;

    Ok(PullWorkspaceResult {
        outcome: PullWorkspaceOutcome::Applied,
        sync_vault_state: Some(applied.sync_vault_state),
        entries: Some(applied.entries),
        exclusion_events: Some(applied.exclusion_events),
        manifest: Some(applied.manifest),
        head_commit_id: Some(head_commit_id),
        files_applied: Some(applied.files_applied),
        entries_deleted: Some(applied.entries_deleted),
    })
}

async fn load_base_markdown_payloads(
    input: &PullWorkspaceInput,
    remote: &impl SyncRemoteClient,
    remote_context: &crate::types::RemoteContext,
    local_vault_id: i64,
    last_synced_commit_id: Option<&str>,
    head_commit_id: &str,
    manifest: &LocalSyncManifest,
) -> Result<HashMap<String, String>, SyncClientError> {
    let Some(base_commit_id) = last_synced_commit_id else {
        return Ok(HashMap::new());
    };
    if base_commit_id == head_commit_id {
        return Ok(HashMap::new());
    }

    let current_markdown_entries = manifest
        .entries
        .iter()
        .filter_map(|entry| match entry {
            LocalSyncManifestEntry::File {
                entry_id,
                name,
                blob_id,
                content_hash,
                ..
            } if name.ends_with(".md") => {
                Some((entry_id.as_str(), (blob_id.as_str(), content_hash.as_str())))
            }
            _ => None,
        })
        .collect::<HashMap<_, _>>();
    if current_markdown_entries.is_empty() {
        return Ok(HashMap::new());
    }

    let base_commit = remote
        .get_commit(remote_context, &input.vault_id, base_commit_id)
        .await?;
    let base_manifest_blob = remote
        .get_blob(
            remote_context,
            &input.vault_id,
            &base_commit.manifest_blob_id,
        )
        .await?;
    ensure_remote_blob_matches(
        &base_manifest_blob,
        &base_commit.manifest_blob_id,
        &base_commit.manifest_ciphertext_hash,
    )?;
    let base_manifest = decrypt_manifest_blob(DecryptManifestBlobInput {
        vault_key_hex: input.vault_key_hex.clone(),
        vault_id: local_vault_id,
        kind: base_manifest_blob.kind,
        ciphertext_base64: base_manifest_blob.ciphertext_base64,
        nonce_base64: base_manifest_blob.nonce_base64,
    })?;
    let base_entries = base_manifest
        .entries
        .iter()
        .filter_map(|entry| match entry {
            LocalSyncManifestEntry::File {
                entry_id,
                blob_id,
                content_hash,
                ..
            } => Some((entry_id.as_str(), (blob_id.as_str(), content_hash.as_str()))),
            _ => None,
        })
        .collect::<HashMap<_, _>>();

    let mut payloads = HashMap::new();
    for (entry_id, (current_blob_id, _)) in current_markdown_entries {
        let Some((base_blob_id, base_content_hash)) = base_entries.get(entry_id).copied() else {
            continue;
        };
        if base_blob_id == current_blob_id {
            continue;
        }

        let base_blob = remote
            .get_blob(remote_context, &input.vault_id, base_blob_id)
            .await?;
        ensure_remote_blob_envelope(&base_blob, base_blob_id)?;
        let decrypted = decrypt_file_blob(DecryptFileBlobInput {
            vault_key_hex: input.vault_key_hex.clone(),
            vault_id: local_vault_id,
            kind: base_blob.kind,
            ciphertext_base64: base_blob.ciphertext_base64,
            nonce_base64: base_blob.nonce_base64,
        })?;
        ensure_decrypted_file_matches_content_hash(&decrypted.plaintext_base64, base_content_hash)?;
        payloads.insert(entry_id.to_string(), decrypted.plaintext_base64);
    }

    Ok(payloads)
}
