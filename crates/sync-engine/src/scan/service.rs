use std::path::Path;

use anyhow::Result;

use crate::{
    manifest::build_manifest,
    store::{PersistSyncStateInput, SaveSyncVaultStateInput, SyncWorkspaceStore},
    types::{ScanOptions, ScanWorkspaceResult},
    util::now_iso_string,
};

use super::{
    matcher::reconcile_scan,
    walker::{walk_workspace, WalkOutput},
};

pub fn scan_workspace(
    workspace_root: &Path,
    store: &impl SyncWorkspaceStore,
    options: ScanOptions,
) -> Result<ScanWorkspaceResult> {
    let existing_entries = store.list_sync_entries()?;
    let current_state = load_or_initialize_vault_state(store)?;

    store.clear_sync_exclusion_events()?;

    let WalkOutput {
        observed_nodes,
        exclusion_events,
        stats,
    } = walk_workspace(workspace_root, &options)?;
    let reconciled = reconcile_scan(&existing_entries, observed_nodes);
    let deleted_entry_ids = existing_entries
        .iter()
        .filter(|existing| {
            !reconciled
                .retained_entry_ids
                .contains(existing.entry_id.as_str())
        })
        .map(|entry| entry.entry_id.clone())
        .collect::<Vec<_>>();
    let entries_deleted = deleted_entry_ids.len();

    let persisted = store.persist_sync_state(&PersistSyncStateInput {
        sync_vault_state: Some(SaveSyncVaultStateInput {
            remote_vault_id: current_state.remote_vault_id.clone(),
            last_synced_commit_id: current_state.last_synced_commit_id.clone(),
            current_key_version: current_state.current_key_version,
            last_remote_head_seen: current_state.last_remote_head_seen.clone(),
            last_scan_at: Some(now_iso_string()),
        }),
        upsert_entries: reconciled.entries,
        deleted_entry_ids,
        conflicts: Vec::new(),
        replace_exclusion_events: Some(exclusion_events),
        exclusion_events_limit: 1_000,
    })?;
    let sync_vault_state = persisted
        .sync_vault_state
        .ok_or_else(|| anyhow::anyhow!("Expected sync vault state after scan persistence"))?;
    let manifest = build_manifest(&sync_vault_state, &persisted.entries);

    Ok(ScanWorkspaceResult {
        sync_vault_state,
        entries: persisted.entries,
        exclusion_events: persisted.exclusion_events,
        manifest,
        files_scanned: stats.files_scanned,
        directories_scanned: stats.directories_scanned,
        entries_deleted,
    })
}

fn load_or_initialize_vault_state(
    store: &impl SyncWorkspaceStore,
) -> Result<crate::types::SyncVaultState> {
    store.get_sync_vault_state()?.map(Ok).unwrap_or_else(|| {
        store.save_sync_vault_state(&SaveSyncVaultStateInput {
            remote_vault_id: None,
            last_synced_commit_id: None,
            current_key_version: 0,
            last_remote_head_seen: None,
            last_scan_at: None,
        })
    })
}
