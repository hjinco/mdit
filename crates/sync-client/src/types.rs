use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use sync_engine::{LocalSyncManifest, SyncEntryRecord, SyncExclusionEventRecord, SyncVaultState};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PushWorkspaceInput {
    pub session_id: u64,
    pub workspace_root: PathBuf,
    pub db_path: PathBuf,
    pub server_url: String,
    pub vault_id: String,
    pub auth_token: String,
    pub user_id: String,
    pub device_id: String,
    pub vault_key_hex: String,
    pub max_file_size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullWorkspaceInput {
    pub session_id: u64,
    pub workspace_root: PathBuf,
    pub db_path: PathBuf,
    pub server_url: String,
    pub vault_id: String,
    pub auth_token: String,
    pub user_id: String,
    pub vault_key_hex: String,
    pub max_file_size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteContext {
    pub server_url: String,
    pub auth_token: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncRemoteHead {
    pub vault_id: String,
    pub current_head_commit_id: Option<String>,
    pub current_key_version: i64,
    pub role: String,
    pub membership_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateRemoteVaultResult {
    pub vault_id: String,
    pub current_head_commit_id: Option<String>,
    pub current_key_version: i64,
    pub created: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UploadRemoteBlobInput {
    pub blob_id: String,
    pub kind: String,
    pub ciphertext_hash: String,
    pub ciphertext_base64: String,
    pub nonce_base64: String,
    pub ciphertext_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UploadRemoteBlobResult {
    pub vault_id: String,
    pub blob_id: String,
    pub kind: String,
    pub existed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBlobEnvelope {
    pub vault_id: String,
    pub blob_id: String,
    pub kind: String,
    pub ciphertext_hash: String,
    pub ciphertext_base64: String,
    pub nonce_base64: String,
    pub ciphertext_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateRemoteCommitInput {
    pub commit_id: String,
    pub base_commit_id: Option<String>,
    pub manifest_blob_id: String,
    pub manifest_ciphertext_hash: String,
    pub created_by_device_id: String,
    pub key_version: i64,
    pub signature: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateRemoteCommitResult {
    pub vault_id: String,
    pub commit_id: String,
    pub current_head_commit_id: String,
    pub current_key_version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCommitRecord {
    pub vault_id: String,
    pub commit_id: String,
    pub base_commit_id: Option<String>,
    pub manifest_blob_id: String,
    pub manifest_ciphertext_hash: String,
    pub created_by_user_id: String,
    pub created_by_device_id: String,
    pub key_version: i64,
    pub signature: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgressEvent {
    pub session_id: u64,
    pub workspace_path: String,
    pub direction: SyncDirection,
    pub phase: SyncPhase,
    pub completed: Option<usize>,
    pub total: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SyncDirection {
    Push,
    Pull,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SyncPhase {
    Starting,
    Scanning,
    Uploading,
    Committing,
    Downloading,
    Applying,
    Finished,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PushWorkspaceResult {
    pub outcome: PushWorkspaceOutcome,
    pub sync_vault_state: SyncVaultState,
    pub entries: Vec<SyncEntryRecord>,
    pub exclusion_events: Vec<SyncExclusionEventRecord>,
    pub manifest: LocalSyncManifest,
    pub commit: Option<CreateRemoteCommitResult>,
    pub uploaded_blob_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PushWorkspaceOutcome {
    Applied,
    NoChanges,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullWorkspaceResult {
    pub outcome: PullWorkspaceOutcome,
    pub sync_vault_state: Option<SyncVaultState>,
    pub entries: Option<Vec<SyncEntryRecord>>,
    pub exclusion_events: Option<Vec<SyncExclusionEventRecord>>,
    pub manifest: Option<LocalSyncManifest>,
    pub head_commit_id: Option<String>,
    pub mutated_rel_paths: Option<Vec<String>>,
    pub files_applied: Option<usize>,
    pub entries_deleted: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PullWorkspaceOutcome {
    Applied,
    AlreadyUpToDate,
    EmptyRemote,
}
