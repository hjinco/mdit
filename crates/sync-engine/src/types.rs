use serde::{Deserialize, Serialize};

use crate::store::RecordSyncExclusionEventInput;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScanOptions {
    pub max_file_size_bytes: Option<u64>,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            max_file_size_bytes: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct LocalDeltaSummary {
    pub created: usize,
    pub updated: usize,
    pub moved: usize,
    pub deleted: usize,
    pub conflicted: usize,
    pub has_changes: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncVaultState {
    pub vault_id: i64,
    pub remote_vault_id: Option<String>,
    pub last_synced_commit_id: Option<String>,
    pub current_key_version: i64,
    pub last_remote_head_seen: Option<String>,
    pub last_scan_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncEntryRecord {
    pub id: i64,
    pub vault_id: i64,
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
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncExclusionEventRecord {
    pub id: i64,
    pub vault_id: i64,
    pub local_path: String,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalSyncEntryState {
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

impl From<&SyncEntryRecord> for LocalSyncEntryState {
    fn from(value: &SyncEntryRecord) -> Self {
        Self {
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
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalSyncManifest {
    pub manifest_version: u32,
    pub vault_id: i64,
    pub base_commit_id: Option<String>,
    pub generated_at: String,
    pub entries: Vec<LocalSyncManifestEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LocalSyncManifestEntry {
    Dir {
        entry_id: String,
        parent_entry_id: Option<String>,
        name: String,
    },
    File {
        entry_id: String,
        parent_entry_id: Option<String>,
        name: String,
        blob_id: String,
        content_hash: String,
        size: u64,
        modified_at: i64,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScanWorkspaceResult {
    pub sync_vault_state: SyncVaultState,
    pub entries: Vec<SyncEntryRecord>,
    pub exclusion_events: Vec<SyncExclusionEventRecord>,
    pub manifest: LocalSyncManifest,
    pub delta: LocalDeltaSummary,
    pub files_scanned: usize,
    pub directories_scanned: usize,
    pub entries_deleted: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreparedSyncBlob {
    pub kind: String,
    pub blob_id: String,
    pub ciphertext_hash: String,
    pub ciphertext_base64: String,
    pub nonce_base64: String,
    pub ciphertext_size: u64,
    pub plaintext_size: u64,
    pub entry_id: Option<String>,
    pub content_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreparedSyncWorkspaceResult {
    pub sync_vault_state: SyncVaultState,
    pub entries: Vec<LocalSyncEntryState>,
    pub exclusion_events: Vec<RecordSyncExclusionEventInput>,
    pub manifest: LocalSyncManifest,
    pub delta: LocalDeltaSummary,
    pub file_blobs: Vec<PreparedSyncBlob>,
    pub manifest_blob: PreparedSyncBlob,
    pub deleted_entry_ids: Vec<String>,
    pub files_scanned: usize,
    pub directories_scanned: usize,
    pub entries_deleted: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LocalWorkspaceSnapshot {
    pub(crate) sync_vault_state: SyncVaultState,
    pub(crate) entries: Vec<LocalSyncEntryState>,
    pub(crate) exclusion_events: Vec<RecordSyncExclusionEventInput>,
    pub(crate) manifest: LocalSyncManifest,
    pub(crate) delta: LocalDeltaSummary,
    pub(crate) deleted_entry_ids: Vec<String>,
    pub(crate) files_scanned: usize,
    pub(crate) directories_scanned: usize,
    pub(crate) entries_deleted: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FinalizePushInput {
    pub remote_vault_id: String,
    pub last_synced_commit_id: String,
    pub current_key_version: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FinalizePushResult {
    pub sync_vault_state: SyncVaultState,
    pub entries: Vec<SyncEntryRecord>,
    pub exclusion_events: Vec<SyncExclusionEventRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRemoteSyncFileInput {
    pub entry_id: String,
    pub parent_entry_id: Option<String>,
    pub name: String,
    pub blob_id: String,
    pub content_hash: String,
    pub size: u64,
    pub modified_at: i64,
    pub plaintext_base64: String,
    pub base_plaintext_base64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRemoteWorkspaceInput {
    pub manifest: LocalSyncManifest,
    pub files: Vec<ApplyRemoteSyncFileInput>,
    pub remote_vault_id: String,
    pub last_synced_commit_id: String,
    pub current_key_version: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRemoteWorkspaceResult {
    pub sync_vault_state: SyncVaultState,
    pub entries: Vec<SyncEntryRecord>,
    pub exclusion_events: Vec<SyncExclusionEventRecord>,
    pub manifest: LocalSyncManifest,
    pub mutated_rel_paths: Vec<String>,
    pub files_applied: usize,
    pub entries_deleted: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DecryptManifestBlobInput {
    pub vault_key_hex: String,
    pub vault_id: i64,
    pub kind: String,
    pub ciphertext_base64: String,
    pub nonce_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DecryptFileBlobInput {
    pub vault_key_hex: String,
    pub vault_id: i64,
    pub kind: String,
    pub ciphertext_base64: String,
    pub nonce_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DecryptedFileBlob {
    pub plaintext_base64: String,
    pub plaintext_size: u64,
}
