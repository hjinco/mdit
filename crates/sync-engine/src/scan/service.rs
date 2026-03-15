use std::path::Path;

use anyhow::Result;

use crate::{
    constants::{SYNC_STATE_CONFLICTED, SYNC_STATE_PENDING},
    manifest::{build_local_manifest, build_manifest},
    store::{
        PersistSyncStateInput, SaveSyncVaultStateInput, SyncWorkspaceStore, UpsertSyncEntryInput,
    },
    types::{
        LocalDeltaSummary, LocalSyncEntryState, LocalWorkspaceSnapshot, ScanOptions,
        ScanWorkspaceResult, SyncEntryRecord,
    },
    util::now_iso_string,
};

use super::{
    matcher::reconcile_scan,
    walker::{walk_workspace, WalkOutput},
};

const PERSIST_SNAPSHOT_EXCLUSION_EVENTS_LIMIT: usize = 1_000;

pub fn scan_workspace(
    workspace_root: &Path,
    store: &impl SyncWorkspaceStore,
    options: ScanOptions,
) -> Result<ScanWorkspaceResult> {
    let snapshot = build_local_workspace_snapshot(workspace_root, store, options)?;
    persist_local_workspace_snapshot(store, snapshot)
}

pub(crate) fn build_local_workspace_snapshot(
    workspace_root: &Path,
    store: &impl SyncWorkspaceStore,
    options: ScanOptions,
) -> Result<LocalWorkspaceSnapshot> {
    let existing_entries = store.list_sync_entries()?;
    let current_state = load_or_initialize_vault_state(store)?;

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
    let delta =
        build_local_delta_summary(&existing_entries, &reconciled.entries, &deleted_entry_ids);
    let entries = reconciled
        .entries
        .iter()
        .map(|entry| LocalSyncEntryState {
            entry_id: entry.entry_id.clone(),
            parent_entry_id: entry.parent_entry_id.clone(),
            name: entry.name.clone(),
            kind: entry.kind.clone(),
            local_path: entry.local_path.clone(),
            last_known_size: entry.last_known_size,
            last_known_mtime_ns: entry.last_known_mtime_ns,
            last_known_content_hash: entry.last_known_content_hash.clone(),
            last_synced_blob_id: entry.last_synced_blob_id.clone(),
            last_synced_content_hash: entry.last_synced_content_hash.clone(),
            sync_state: entry.sync_state.clone(),
        })
        .collect::<Vec<_>>();
    let manifest = build_local_manifest(&current_state, &entries);

    Ok(LocalWorkspaceSnapshot {
        sync_vault_state: current_state,
        entries,
        exclusion_events,
        manifest,
        delta,
        deleted_entry_ids,
        files_scanned: stats.files_scanned,
        directories_scanned: stats.directories_scanned,
        entries_deleted,
    })
}

fn persist_local_workspace_snapshot(
    store: &impl SyncWorkspaceStore,
    snapshot: LocalWorkspaceSnapshot,
) -> Result<ScanWorkspaceResult> {
    let persisted = store.persist_sync_state(&PersistSyncStateInput {
        sync_vault_state: Some(SaveSyncVaultStateInput {
            remote_vault_id: snapshot.sync_vault_state.remote_vault_id.clone(),
            last_synced_commit_id: snapshot.sync_vault_state.last_synced_commit_id.clone(),
            current_key_version: snapshot.sync_vault_state.current_key_version,
            last_remote_head_seen: snapshot.sync_vault_state.last_remote_head_seen.clone(),
            last_scan_at: Some(now_iso_string()),
        }),
        upsert_entries: snapshot
            .entries
            .iter()
            .map(|entry| UpsertSyncEntryInput {
                entry_id: entry.entry_id.clone(),
                parent_entry_id: entry.parent_entry_id.clone(),
                name: entry.name.clone(),
                kind: entry.kind.clone(),
                local_path: entry.local_path.clone(),
                last_known_size: entry.last_known_size,
                last_known_mtime_ns: entry.last_known_mtime_ns,
                last_known_content_hash: entry.last_known_content_hash.clone(),
                last_synced_blob_id: entry.last_synced_blob_id.clone(),
                last_synced_content_hash: entry.last_synced_content_hash.clone(),
                sync_state: entry.sync_state.clone(),
            })
            .collect(),
        deleted_entry_ids: snapshot.deleted_entry_ids.clone(),
        conflicts: Vec::new(),
        replace_exclusion_events: Some(snapshot.exclusion_events),
        exclusion_events_limit: PERSIST_SNAPSHOT_EXCLUSION_EVENTS_LIMIT,
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
        delta: snapshot.delta,
        files_scanned: snapshot.files_scanned,
        directories_scanned: snapshot.directories_scanned,
        entries_deleted: snapshot.entries_deleted,
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

fn build_local_delta_summary(
    existing_entries: &[SyncEntryRecord],
    reconciled_entries: &[UpsertSyncEntryInput],
    deleted_entry_ids: &[String],
) -> LocalDeltaSummary {
    let existing_by_entry_id = existing_entries
        .iter()
        .map(|entry| (entry.entry_id.as_str(), entry))
        .collect::<std::collections::HashMap<_, _>>();

    let mut delta = LocalDeltaSummary {
        deleted: deleted_entry_ids.len(),
        ..LocalDeltaSummary::default()
    };

    for entry in reconciled_entries {
        let Some(existing) = existing_by_entry_id.get(entry.entry_id.as_str()) else {
            delta.created += 1;
            if entry.sync_state == SYNC_STATE_CONFLICTED {
                delta.conflicted += 1;
            }
            continue;
        };

        let moved = existing.local_path != entry.local_path
            || existing.name != entry.name
            || existing.parent_entry_id != entry.parent_entry_id;
        if moved {
            delta.moved += 1;
        }

        let updated = entry.sync_state == SYNC_STATE_PENDING
            && !moved
            && (existing.kind != entry.kind
                || existing.last_known_size != entry.last_known_size
                || existing.last_known_content_hash != entry.last_known_content_hash);
        if updated {
            delta.updated += 1;
        }

        if entry.sync_state == SYNC_STATE_CONFLICTED {
            delta.conflicted += 1;
        }
    }

    delta.has_changes = delta.created > 0
        || delta.updated > 0
        || delta.moved > 0
        || delta.deleted > 0
        || delta.conflicted > 0;
    delta
}
