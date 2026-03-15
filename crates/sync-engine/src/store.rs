use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::types::{SyncEntryRecord, SyncExclusionEventRecord, SyncVaultState};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SaveSyncVaultStateInput {
    pub remote_vault_id: Option<String>,
    pub last_synced_commit_id: Option<String>,
    pub current_key_version: i64,
    pub last_remote_head_seen: Option<String>,
    pub last_scan_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpsertSyncEntryInput {
    pub entry_id: String,
    pub parent_entry_id: Option<String>,
    pub name: String,
    pub kind: String,
    pub local_path: String,
    pub last_known_size: Option<i64>,
    pub last_known_mtime_ns: Option<i64>,
    pub last_known_content_hash: Option<String>,
    pub last_synced_blob_id: Option<String>,
    pub last_synced_content_hash: Option<String>,
    pub sync_state: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordSyncConflictInput {
    pub entry_id: Option<String>,
    pub original_path: String,
    pub conflict_path: String,
    pub base_commit_id: Option<String>,
    pub remote_commit_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecordSyncExclusionEventInput {
    pub local_path: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersistSyncStateInput {
    pub sync_vault_state: Option<SaveSyncVaultStateInput>,
    pub upsert_entries: Vec<UpsertSyncEntryInput>,
    pub deleted_entry_ids: Vec<String>,
    pub conflicts: Vec<RecordSyncConflictInput>,
    pub replace_exclusion_events: Option<Vec<RecordSyncExclusionEventInput>>,
    pub exclusion_events_limit: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersistSyncStateResult {
    pub sync_vault_state: Option<SyncVaultState>,
    pub entries: Vec<SyncEntryRecord>,
    pub exclusion_events: Vec<SyncExclusionEventRecord>,
}

pub trait SyncWorkspaceStore: Send + Sync {
    fn get_sync_vault_state(&self) -> Result<Option<SyncVaultState>>;

    fn touch_sync_vault_state(&self) -> Result<SyncVaultState>;

    fn save_sync_vault_state(&self, input: &SaveSyncVaultStateInput) -> Result<SyncVaultState>;

    fn list_sync_entries(&self) -> Result<Vec<SyncEntryRecord>>;

    fn upsert_sync_entry(&self, input: &UpsertSyncEntryInput) -> Result<SyncEntryRecord>;

    fn delete_sync_entry(&self, entry_id: &str) -> Result<()>;

    fn record_sync_conflict(&self, input: &RecordSyncConflictInput) -> Result<()>;

    fn record_sync_exclusion_event(&self, input: &RecordSyncExclusionEventInput) -> Result<()>;

    fn list_sync_exclusion_events(&self, limit: usize) -> Result<Vec<SyncExclusionEventRecord>>;

    fn clear_sync_exclusion_events(&self) -> Result<()>;

    fn persist_sync_state(&self, input: &PersistSyncStateInput) -> Result<PersistSyncStateResult>;
}
