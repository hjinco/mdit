use std::path::{Path, PathBuf};

use anyhow::Result;
use sync_engine::{
    PersistSyncStateInput, PersistSyncStateResult, RecordSyncConflictInput,
    RecordSyncExclusionEventInput, SaveSyncVaultStateInput, SyncEntryRecord,
    SyncExclusionEventRecord, SyncVaultState, SyncWorkspaceStore, UpsertSyncEntryInput,
};

#[derive(Debug, Clone)]
pub struct AppStorageSyncStore {
    db_path: PathBuf,
    workspace_root: PathBuf,
}

impl AppStorageSyncStore {
    pub fn new(db_path: PathBuf, workspace_root: PathBuf) -> Self {
        Self {
            db_path,
            workspace_root,
        }
    }

    fn db_path(&self) -> &Path {
        &self.db_path
    }

    fn workspace_root(&self) -> &Path {
        &self.workspace_root
    }
}

impl SyncWorkspaceStore for AppStorageSyncStore {
    fn get_sync_vault_state(&self) -> Result<Option<SyncVaultState>> {
        app_storage::sync_state::get_sync_vault_state(self.db_path(), self.workspace_root())
            .map(|state| state.map(map_sync_vault_state))
    }

    fn touch_sync_vault_state(&self) -> Result<SyncVaultState> {
        app_storage::sync_state::touch_sync_vault_state(self.db_path(), self.workspace_root())
            .map(map_sync_vault_state)
    }

    fn save_sync_vault_state(&self, input: &SaveSyncVaultStateInput) -> Result<SyncVaultState> {
        app_storage::sync_state::save_sync_vault_state(
            self.db_path(),
            self.workspace_root(),
            &app_storage::sync_state::SaveSyncVaultStateInput {
                remote_vault_id: input.remote_vault_id.clone(),
                last_synced_commit_id: input.last_synced_commit_id.clone(),
                current_key_version: input.current_key_version,
                last_remote_head_seen: input.last_remote_head_seen.clone(),
                last_scan_at: input.last_scan_at.clone(),
            },
        )
        .map(map_sync_vault_state)
    }

    fn list_sync_entries(&self) -> Result<Vec<SyncEntryRecord>> {
        app_storage::sync_state::list_sync_entries(self.db_path(), self.workspace_root())
            .map(|entries| entries.into_iter().map(map_sync_entry).collect())
    }

    fn upsert_sync_entry(&self, input: &UpsertSyncEntryInput) -> Result<SyncEntryRecord> {
        app_storage::sync_state::upsert_sync_entry(
            self.db_path(),
            self.workspace_root(),
            &app_storage::sync_state::UpsertSyncEntryInput {
                entry_id: input.entry_id.clone(),
                parent_entry_id: input.parent_entry_id.clone(),
                name: input.name.clone(),
                kind: input.kind.clone(),
                local_path: input.local_path.clone(),
                last_known_size: input.last_known_size,
                last_known_mtime_ns: input.last_known_mtime_ns,
                last_known_content_hash: input.last_known_content_hash.clone(),
                last_synced_blob_id: input.last_synced_blob_id.clone(),
                last_synced_content_hash: input.last_synced_content_hash.clone(),
                sync_state: input.sync_state.clone(),
            },
        )
        .map(map_sync_entry)
    }

    fn delete_sync_entry(&self, entry_id: &str) -> Result<()> {
        app_storage::sync_state::delete_sync_entry(self.db_path(), self.workspace_root(), entry_id)
    }

    fn record_sync_conflict(&self, input: &RecordSyncConflictInput) -> Result<()> {
        app_storage::sync_state::record_sync_conflict(
            self.db_path(),
            self.workspace_root(),
            &app_storage::sync_state::RecordSyncConflictInput {
                entry_id: input.entry_id.clone(),
                original_path: input.original_path.clone(),
                conflict_path: input.conflict_path.clone(),
                base_commit_id: input.base_commit_id.clone(),
                remote_commit_id: input.remote_commit_id.clone(),
            },
        )?;
        Ok(())
    }

    fn record_sync_exclusion_event(&self, input: &RecordSyncExclusionEventInput) -> Result<()> {
        app_storage::sync_state::record_sync_exclusion_event(
            self.db_path(),
            self.workspace_root(),
            &app_storage::sync_state::RecordSyncExclusionEventInput {
                local_path: input.local_path.clone(),
                reason: input.reason.clone(),
            },
        )?;
        Ok(())
    }

    fn list_sync_exclusion_events(&self, limit: usize) -> Result<Vec<SyncExclusionEventRecord>> {
        app_storage::sync_state::list_sync_exclusion_events(
            self.db_path(),
            self.workspace_root(),
            limit,
        )
        .map(|events| events.into_iter().map(map_sync_exclusion_event).collect())
    }

    fn clear_sync_exclusion_events(&self) -> Result<()> {
        app_storage::sync_state::clear_sync_exclusion_events(self.db_path(), self.workspace_root())
    }

    fn persist_sync_state(&self, input: &PersistSyncStateInput) -> Result<PersistSyncStateResult> {
        app_storage::sync_state::persist_sync_state(
            self.db_path(),
            self.workspace_root(),
            &app_storage::sync_state::PersistSyncStateInput {
                sync_vault_state: input.sync_vault_state.as_ref().map(|value| {
                    app_storage::sync_state::SaveSyncVaultStateInput {
                        remote_vault_id: value.remote_vault_id.clone(),
                        last_synced_commit_id: value.last_synced_commit_id.clone(),
                        current_key_version: value.current_key_version,
                        last_remote_head_seen: value.last_remote_head_seen.clone(),
                        last_scan_at: value.last_scan_at.clone(),
                    }
                }),
                upsert_entries: input
                    .upsert_entries
                    .iter()
                    .map(|value| app_storage::sync_state::UpsertSyncEntryInput {
                        entry_id: value.entry_id.clone(),
                        parent_entry_id: value.parent_entry_id.clone(),
                        name: value.name.clone(),
                        kind: value.kind.clone(),
                        local_path: value.local_path.clone(),
                        last_known_size: value.last_known_size,
                        last_known_mtime_ns: value.last_known_mtime_ns,
                        last_known_content_hash: value.last_known_content_hash.clone(),
                        last_synced_blob_id: value.last_synced_blob_id.clone(),
                        last_synced_content_hash: value.last_synced_content_hash.clone(),
                        sync_state: value.sync_state.clone(),
                    })
                    .collect(),
                deleted_entry_ids: input.deleted_entry_ids.clone(),
                conflicts: input
                    .conflicts
                    .iter()
                    .map(|value| app_storage::sync_state::RecordSyncConflictInput {
                        entry_id: value.entry_id.clone(),
                        original_path: value.original_path.clone(),
                        conflict_path: value.conflict_path.clone(),
                        base_commit_id: value.base_commit_id.clone(),
                        remote_commit_id: value.remote_commit_id.clone(),
                    })
                    .collect(),
                replace_exclusion_events: input.replace_exclusion_events.as_ref().map(|events| {
                    events
                        .iter()
                        .map(
                            |value| app_storage::sync_state::RecordSyncExclusionEventInput {
                                local_path: value.local_path.clone(),
                                reason: value.reason.clone(),
                            },
                        )
                        .collect()
                }),
                exclusion_events_limit: input.exclusion_events_limit,
            },
        )
        .map(|result| PersistSyncStateResult {
            sync_vault_state: result.sync_vault_state.map(map_sync_vault_state),
            entries: result.entries.into_iter().map(map_sync_entry).collect(),
            exclusion_events: result
                .exclusion_events
                .into_iter()
                .map(map_sync_exclusion_event)
                .collect(),
        })
    }
}

fn map_sync_vault_state(value: app_storage::sync_state::SyncVaultState) -> SyncVaultState {
    SyncVaultState {
        vault_id: value.vault_id,
        remote_vault_id: value.remote_vault_id,
        last_synced_commit_id: value.last_synced_commit_id,
        current_key_version: value.current_key_version,
        last_remote_head_seen: value.last_remote_head_seen,
        last_scan_at: value.last_scan_at,
        created_at: value.created_at,
        updated_at: value.updated_at,
    }
}

fn map_sync_entry(value: app_storage::sync_state::SyncEntryRecord) -> SyncEntryRecord {
    SyncEntryRecord {
        id: value.id,
        vault_id: value.vault_id,
        entry_id: value.entry_id,
        parent_entry_id: value.parent_entry_id,
        name: value.name,
        kind: value.kind,
        local_path: value.local_path,
        last_known_size: value.last_known_size,
        last_known_mtime_ns: value.last_known_mtime_ns,
        last_known_content_hash: value.last_known_content_hash,
        last_synced_blob_id: value.last_synced_blob_id,
        last_synced_content_hash: value.last_synced_content_hash,
        sync_state: value.sync_state,
        created_at: value.created_at,
        updated_at: value.updated_at,
    }
}

fn map_sync_exclusion_event(
    value: app_storage::sync_state::SyncExclusionEventRecord,
) -> SyncExclusionEventRecord {
    SyncExclusionEventRecord {
        id: value.id,
        vault_id: value.vault_id,
        local_path: value.local_path,
        reason: value.reason,
        created_at: value.created_at,
    }
}
