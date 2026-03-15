use std::collections::HashMap;
use std::path::Path;

use anyhow::Result;

use crate::constants::{ENTRY_KIND_DIR, ENTRY_KIND_FILE, SYNC_STATE_SYNCED};
use crate::crypto::prepare_encrypted_workspace;
use crate::store::{
    PersistSyncStateInput, SaveSyncVaultStateInput, SyncWorkspaceStore, UpsertSyncEntryInput,
};
use crate::types::{
    FinalizePushInput, FinalizePushResult, PreparedSyncWorkspaceResult, ScanOptions,
};

pub fn prepare_push_workspace(
    workspace_root: &Path,
    store: &impl SyncWorkspaceStore,
    vault_key_hex: &str,
    options: ScanOptions,
) -> Result<PreparedSyncWorkspaceResult> {
    prepare_encrypted_workspace(workspace_root, store, vault_key_hex, options)
}

pub fn finalize_push_workspace(
    store: &impl SyncWorkspaceStore,
    prepared: &PreparedSyncWorkspaceResult,
    input: &FinalizePushInput,
) -> Result<FinalizePushResult> {
    let blob_ids_by_entry_id = prepared
        .file_blobs
        .iter()
        .filter_map(|blob| {
            blob.entry_id
                .as_ref()
                .map(|entry_id| (entry_id.as_str(), blob.blob_id.as_str()))
        })
        .collect::<HashMap<_, _>>();

    let mut upsert_entries = Vec::with_capacity(prepared.entries.len());
    for entry in &prepared.entries {
        let (last_synced_blob_id, last_synced_content_hash) = if entry.kind == ENTRY_KIND_FILE {
            (
                blob_ids_by_entry_id
                    .get(entry.entry_id.as_str())
                    .map(|blob_id| (*blob_id).to_string()),
                entry.last_known_content_hash.clone(),
            )
        } else {
            (None, None)
        };

        let kind = if entry.kind == ENTRY_KIND_DIR {
            ENTRY_KIND_DIR
        } else {
            ENTRY_KIND_FILE
        };

        upsert_entries.push(UpsertSyncEntryInput {
            entry_id: entry.entry_id.clone(),
            parent_entry_id: entry.parent_entry_id.clone(),
            name: entry.name.clone(),
            kind: kind.to_string(),
            local_path: entry.local_path.clone(),
            last_known_size: entry.last_known_size,
            last_known_mtime_ns: entry.last_known_mtime_ns,
            last_known_content_hash: entry.last_known_content_hash.clone(),
            last_synced_blob_id,
            last_synced_content_hash,
            sync_state: SYNC_STATE_SYNCED.to_string(),
        });
    }

    let persisted = store.persist_sync_state(&PersistSyncStateInput {
        sync_vault_state: Some(SaveSyncVaultStateInput {
            remote_vault_id: Some(input.remote_vault_id.clone()),
            last_synced_commit_id: Some(input.last_synced_commit_id.clone()),
            current_key_version: input.current_key_version,
            last_remote_head_seen: Some(input.last_synced_commit_id.clone()),
            last_scan_at: prepared.sync_vault_state.last_scan_at.clone(),
        }),
        upsert_entries,
        deleted_entry_ids: prepared.deleted_entry_ids.clone(),
        conflicts: Vec::new(),
        replace_exclusion_events: Some(prepared.exclusion_events.clone()),
        exclusion_events_limit: 100,
    })?;
    let sync_vault_state = persisted.sync_vault_state.ok_or_else(|| {
        anyhow::anyhow!("Expected sync vault state after finalizing push persistence")
    })?;

    Ok(FinalizePushResult {
        sync_vault_state,
        entries: persisted.entries,
        exclusion_events: persisted.exclusion_events,
    })
}
