mod harness;

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;

use async_trait::async_trait;
use sync_engine::{scan_workspace, LocalSyncManifestEntry, ScanOptions, SyncWorkspaceStore};

use crate::{
    pull_workspace, push_workspace, CreateRemoteCommitInput, CreateRemoteCommitResult,
    CreateRemoteVaultResult, PullWorkspaceInput, PullWorkspaceOutcome, PushWorkspaceInput,
    PushWorkspaceOutcome, RemoteBlobEnvelope, RemoteCommitRecord, RemoteContext, SyncClientError,
    SyncDirection, SyncPhase, SyncProgressEvent, SyncProgressSink, SyncRemoteClient,
    SyncRemoteHead, UploadRemoteBlobInput, UploadRemoteBlobResult,
};

use self::harness::Harness;

#[derive(Debug, Default)]
struct MockProgressSink {
    events: Arc<Mutex<Vec<SyncProgressEvent>>>,
}

impl MockProgressSink {
    fn events(&self) -> Vec<SyncProgressEvent> {
        self.events.lock().expect("events lock").clone()
    }
}

impl SyncProgressSink for MockProgressSink {
    fn emit(&self, event: SyncProgressEvent) -> Result<(), SyncClientError> {
        self.events.lock().expect("events lock").push(event);
        Ok(())
    }
}

#[derive(Debug, Clone)]
struct MockRemote {
    create_vault_result: CreateRemoteVaultResult,
    head: SyncRemoteHead,
    commit_result: Result<CreateRemoteCommitResult, SyncClientError>,
    commit_results: Arc<Mutex<Vec<Result<CreateRemoteCommitResult, SyncClientError>>>>,
    commit_record: RemoteCommitRecord,
    manifest_blob: RemoteBlobEnvelope,
    file_blob: RemoteBlobEnvelope,
    extra_commits: HashMap<String, RemoteCommitRecord>,
    extra_blobs: HashMap<String, RemoteBlobEnvelope>,
    upload_calls: Arc<Mutex<Vec<UploadRemoteBlobInput>>>,
    blob_requests: Arc<Mutex<Vec<String>>>,
}

impl Default for MockRemote {
    fn default() -> Self {
        Self {
            create_vault_result: CreateRemoteVaultResult {
                vault_id: "vault-1".to_string(),
                current_head_commit_id: None,
                current_key_version: 1,
                created: true,
            },
            head: SyncRemoteHead {
                vault_id: "vault-1".to_string(),
                current_head_commit_id: None,
                current_key_version: 1,
                role: "owner".to_string(),
                membership_status: "active".to_string(),
            },
            commit_result: Ok(CreateRemoteCommitResult {
                vault_id: "vault-1".to_string(),
                commit_id: "commit-1".to_string(),
                current_head_commit_id: "commit-1".to_string(),
                current_key_version: 1,
            }),
            commit_results: Arc::new(Mutex::new(Vec::new())),
            commit_record: RemoteCommitRecord {
                vault_id: "vault-1".to_string(),
                commit_id: "commit-1".to_string(),
                base_commit_id: None,
                manifest_blob_id: String::new(),
                manifest_ciphertext_hash: String::new(),
                created_by_user_id: "user-1".to_string(),
                created_by_device_id: "device-1".to_string(),
                key_version: 1,
                signature: "sig".to_string(),
                created_at: 1,
            },
            manifest_blob: RemoteBlobEnvelope {
                vault_id: "1".to_string(),
                blob_id: String::new(),
                kind: "manifest".to_string(),
                ciphertext_hash: String::new(),
                ciphertext_base64: String::new(),
                nonce_base64: String::new(),
                ciphertext_size: 0,
            },
            file_blob: RemoteBlobEnvelope {
                vault_id: "1".to_string(),
                blob_id: String::new(),
                kind: "file".to_string(),
                ciphertext_hash: String::new(),
                ciphertext_base64: String::new(),
                nonce_base64: String::new(),
                ciphertext_size: 0,
            },
            extra_commits: HashMap::new(),
            extra_blobs: HashMap::new(),
            upload_calls: Arc::new(Mutex::new(Vec::new())),
            blob_requests: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl MockRemote {
    fn blob_requests(&self) -> Vec<String> {
        self.blob_requests.lock().expect("blob requests").clone()
    }

    fn upload_calls(&self) -> Vec<UploadRemoteBlobInput> {
        self.upload_calls.lock().expect("upload calls").clone()
    }
}

#[async_trait]
impl SyncRemoteClient for MockRemote {
    async fn create_vault(
        &self,
        _context: &RemoteContext,
        _vault_id: &str,
        _current_key_version: Option<i64>,
    ) -> Result<CreateRemoteVaultResult, SyncClientError> {
        Ok(self.create_vault_result.clone())
    }

    async fn get_head(
        &self,
        _context: &RemoteContext,
        _vault_id: &str,
    ) -> Result<SyncRemoteHead, SyncClientError> {
        Ok(self.head.clone())
    }

    async fn upload_blob(
        &self,
        _context: &RemoteContext,
        _vault_id: &str,
        input: UploadRemoteBlobInput,
    ) -> Result<UploadRemoteBlobResult, SyncClientError> {
        self.upload_calls
            .lock()
            .expect("upload calls")
            .push(input.clone());
        Ok(UploadRemoteBlobResult {
            vault_id: "vault-1".to_string(),
            blob_id: input.blob_id,
            kind: input.kind,
            existed: false,
        })
    }

    async fn get_blob(
        &self,
        _context: &RemoteContext,
        _vault_id: &str,
        blob_id: &str,
    ) -> Result<RemoteBlobEnvelope, SyncClientError> {
        self.blob_requests
            .lock()
            .expect("blob requests")
            .push(blob_id.to_string());
        if blob_id == self.commit_record.manifest_blob_id {
            return Ok(self.manifest_blob.clone());
        }
        if let Some(blob) = self.extra_blobs.get(blob_id) {
            return Ok(blob.clone());
        }
        if self.file_blob.blob_id == blob_id {
            return Ok(self.file_blob.clone());
        }
        Ok(self.file_blob.clone())
    }

    async fn create_commit(
        &self,
        _context: &RemoteContext,
        _vault_id: &str,
        _input: CreateRemoteCommitInput,
    ) -> Result<CreateRemoteCommitResult, SyncClientError> {
        let mut queued = self.commit_results.lock().expect("commit results");
        if !queued.is_empty() {
            return queued.remove(0);
        }
        self.commit_result.clone()
    }

    async fn get_commit(
        &self,
        _context: &RemoteContext,
        _vault_id: &str,
        commit_id: &str,
    ) -> Result<RemoteCommitRecord, SyncClientError> {
        if let Some(commit) = self.extra_commits.get(commit_id) {
            return Ok(commit.clone());
        }
        Ok(self.commit_record.clone())
    }
}

fn modified_time_ns(path: &Path) -> Option<i64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    let duration = modified.duration_since(UNIX_EPOCH).ok()?;
    i64::try_from(duration.as_nanos()).ok()
}

#[tokio::test]
async fn push_workspace_uploads_blobs_creates_commit_and_updates_state() {
    let harness = Harness::new("sync-client-push");
    harness.write_file("note.md", "hello");

    let progress = MockProgressSink::default();
    let remote = MockRemote::default();
    let result = push_workspace(
        PushWorkspaceInput {
            session_id: 1,
            workspace_root: harness.workspace.clone(),
            db_path: harness.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            device_id: "device-1".to_string(),
            vault_key_hex: harness.vault_key_hex(),
            max_file_size_bytes: None,
        },
        harness.store(),
        &remote,
        &progress,
    )
    .await
    .expect("push should succeed");

    assert_eq!(result.outcome, PushWorkspaceOutcome::Applied);
    assert_eq!(
        result
            .commit
            .as_ref()
            .expect("applied push should include commit")
            .current_head_commit_id,
        "commit-1"
    );
    assert_eq!(result.uploaded_blob_count, 2);
    assert_eq!(
        result.sync_vault_state.last_synced_commit_id.as_deref(),
        Some("commit-1")
    );
    assert!(result
        .entries
        .iter()
        .all(|entry| entry.sync_state == "synced"));
    let file_entry = result
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("file entry should exist");
    assert_eq!(
        file_entry.last_synced_blob_id.as_deref(),
        Some(
            result
                .manifest
                .entries
                .iter()
                .find_map(|entry| match entry {
                    LocalSyncManifestEntry::File { blob_id, .. } => Some(blob_id.as_str()),
                    LocalSyncManifestEntry::Dir { .. } => None,
                })
                .expect("manifest file entry should exist")
        )
    );
    assert_eq!(
        progress
            .events()
            .into_iter()
            .map(|event| event.phase)
            .collect::<Vec<_>>(),
        vec![
            SyncPhase::Starting,
            SyncPhase::Scanning,
            SyncPhase::Uploading,
            SyncPhase::Uploading,
            SyncPhase::Committing,
            SyncPhase::Finished,
        ]
    );
}

#[tokio::test]
async fn push_workspace_retries_failed_create_without_new_local_edits() {
    let harness = Harness::new("sync-client-push-retry-create");
    harness.write_file("note.md", "hello");

    let remote = MockRemote {
        commit_results: Arc::new(Mutex::new(vec![
            Err(SyncClientError::remote("INTERNAL_ERROR", "temporary")),
            Ok(CreateRemoteCommitResult {
                vault_id: "vault-1".to_string(),
                commit_id: "commit-1".to_string(),
                current_head_commit_id: "commit-1".to_string(),
                current_key_version: 1,
            }),
        ])),
        ..MockRemote::default()
    };

    let first_error = push_workspace(
        PushWorkspaceInput {
            session_id: 11,
            workspace_root: harness.workspace.clone(),
            db_path: harness.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            device_id: "device-1".to_string(),
            vault_key_hex: harness.vault_key_hex(),
            max_file_size_bytes: None,
        },
        harness.store(),
        &remote,
        &MockProgressSink::default(),
    )
    .await
    .expect_err("first push should fail");
    assert_eq!(
        first_error,
        SyncClientError::remote("INTERNAL_ERROR", "temporary")
    );
    assert!(harness
        .store()
        .list_sync_entries()
        .expect("entries should load after failed push")
        .is_empty());

    let retried = push_workspace(
        PushWorkspaceInput {
            session_id: 12,
            workspace_root: harness.workspace.clone(),
            db_path: harness.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            device_id: "device-1".to_string(),
            vault_key_hex: harness.vault_key_hex(),
            max_file_size_bytes: None,
        },
        harness.store(),
        &remote,
        &MockProgressSink::default(),
    )
    .await
    .expect("retry push should succeed");

    assert_eq!(retried.outcome, PushWorkspaceOutcome::Applied);
    assert_eq!(remote.upload_calls().len(), 4);
    assert_eq!(
        retried.sync_vault_state.last_synced_commit_id.as_deref(),
        Some("commit-1")
    );
}

#[tokio::test]
async fn push_workspace_bootstraps_empty_remote_for_empty_workspace() {
    let harness = Harness::new("sync-client-push-empty-bootstrap");
    let remote = MockRemote::default();

    let result = push_workspace(
        PushWorkspaceInput {
            session_id: 13,
            workspace_root: harness.workspace.clone(),
            db_path: harness.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            device_id: "device-1".to_string(),
            vault_key_hex: harness.vault_key_hex(),
            max_file_size_bytes: None,
        },
        harness.store(),
        &remote,
        &MockProgressSink::default(),
    )
    .await
    .expect("empty workspace push should succeed");

    assert_eq!(result.outcome, PushWorkspaceOutcome::Applied);
    assert_eq!(result.uploaded_blob_count, 1);
    assert!(result.manifest.entries.is_empty());
    assert_eq!(remote.upload_calls().len(), 1);
    assert_eq!(
        result.sync_vault_state.last_synced_commit_id.as_deref(),
        Some("commit-1")
    );
}

#[tokio::test]
async fn push_workspace_returns_head_conflict_on_preflight_mismatch() {
    let harness = Harness::new("sync-client-push-head");
    harness.write_file("note.md", "hello");

    let remote = MockRemote {
        head: SyncRemoteHead {
            current_head_commit_id: Some("commit-9".to_string()),
            ..MockRemote::default().head
        },
        ..MockRemote::default()
    };

    let error = push_workspace(
        PushWorkspaceInput {
            session_id: 2,
            workspace_root: harness.workspace.clone(),
            db_path: harness.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            device_id: "device-1".to_string(),
            vault_key_hex: harness.vault_key_hex(),
            max_file_size_bytes: None,
        },
        harness.store(),
        &remote,
        &MockProgressSink::default(),
    )
    .await
    .expect_err("push should fail");

    assert_eq!(
        error,
        SyncClientError::HeadConflict {
            current_head_commit_id: Some("commit-9".to_string()),
        }
    );
}

#[tokio::test]
async fn push_workspace_retries_delete_only_changes_after_failed_commit() {
    let harness = Harness::new("sync-client-push-delete-retry");
    harness.write_file("note.md", "hello");

    push_workspace(
        PushWorkspaceInput {
            session_id: 14,
            workspace_root: harness.workspace.clone(),
            db_path: harness.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            device_id: "device-1".to_string(),
            vault_key_hex: harness.vault_key_hex(),
            max_file_size_bytes: None,
        },
        harness.store(),
        &MockRemote::default(),
        &MockProgressSink::default(),
    )
    .await
    .expect("initial push should succeed");

    fs::remove_file(harness.workspace.join("note.md")).expect("failed to remove note");
    let remote = MockRemote {
        head: SyncRemoteHead {
            current_head_commit_id: Some("commit-1".to_string()),
            ..MockRemote::default().head
        },
        commit_results: Arc::new(Mutex::new(vec![
            Err(SyncClientError::remote("INTERNAL_ERROR", "temporary")),
            Ok(CreateRemoteCommitResult {
                vault_id: "vault-1".to_string(),
                commit_id: "commit-2".to_string(),
                current_head_commit_id: "commit-2".to_string(),
                current_key_version: 1,
            }),
        ])),
        ..MockRemote::default()
    };

    let first_error = push_workspace(
        PushWorkspaceInput {
            session_id: 15,
            workspace_root: harness.workspace.clone(),
            db_path: harness.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            device_id: "device-1".to_string(),
            vault_key_hex: harness.vault_key_hex(),
            max_file_size_bytes: None,
        },
        harness.store(),
        &remote,
        &MockProgressSink::default(),
    )
    .await
    .expect_err("first delete push should fail");
    assert_eq!(
        first_error,
        SyncClientError::remote("INTERNAL_ERROR", "temporary")
    );
    assert_eq!(
        harness
            .store()
            .list_sync_entries()
            .expect("entries should load after failed delete push")
            .len(),
        1
    );

    let retried = push_workspace(
        PushWorkspaceInput {
            session_id: 16,
            workspace_root: harness.workspace.clone(),
            db_path: harness.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            device_id: "device-1".to_string(),
            vault_key_hex: harness.vault_key_hex(),
            max_file_size_bytes: None,
        },
        harness.store(),
        &remote,
        &MockProgressSink::default(),
    )
    .await
    .expect("retry delete push should succeed");

    assert_eq!(retried.outcome, PushWorkspaceOutcome::Applied);
    assert!(retried.entries.is_empty());
    assert!(harness
        .store()
        .list_sync_entries()
        .expect("entries should load after delete finalize")
        .is_empty());
    assert_eq!(remote.upload_calls().len(), 2);
}

#[tokio::test]
async fn pull_workspace_decrypts_and_applies_remote_payload() {
    let source = Harness::new("sync-client-pull-source");
    source.write_file("note.md", "hello");
    let prepared = source.prepare_encrypted();

    let target = Harness::new("sync-client-pull-target");
    let progress = MockProgressSink::default();
    let remote = MockRemote {
        head: SyncRemoteHead {
            current_head_commit_id: Some("commit-1".to_string()),
            current_key_version: 2,
            ..MockRemote::default().head
        },
        commit_record: RemoteCommitRecord {
            manifest_blob_id: prepared.manifest_blob.blob_id.clone(),
            manifest_ciphertext_hash: prepared.manifest_blob.ciphertext_hash.clone(),
            key_version: 2,
            ..MockRemote::default().commit_record
        },
        manifest_blob: RemoteBlobEnvelope {
            blob_id: prepared.manifest_blob.blob_id.clone(),
            ciphertext_hash: prepared.manifest_blob.ciphertext_hash.clone(),
            ciphertext_base64: prepared.manifest_blob.ciphertext_base64.clone(),
            nonce_base64: prepared.manifest_blob.nonce_base64.clone(),
            ciphertext_size: prepared.manifest_blob.ciphertext_size,
            ..MockRemote::default().manifest_blob
        },
        file_blob: RemoteBlobEnvelope {
            blob_id: prepared.file_blobs[0].blob_id.clone(),
            ciphertext_hash: prepared.file_blobs[0].ciphertext_hash.clone(),
            ciphertext_base64: prepared.file_blobs[0].ciphertext_base64.clone(),
            nonce_base64: prepared.file_blobs[0].nonce_base64.clone(),
            ciphertext_size: prepared.file_blobs[0].ciphertext_size,
            ..MockRemote::default().file_blob
        },
        ..MockRemote::default()
    };

    let result = pull_workspace(
        PullWorkspaceInput {
            session_id: 3,
            workspace_root: target.workspace.clone(),
            db_path: target.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            vault_key_hex: source.vault_key_hex(),
            max_file_size_bytes: None,
        },
        target.store(),
        &remote,
        &progress,
    )
    .await
    .expect("pull should succeed");

    assert_eq!(result.outcome, PullWorkspaceOutcome::Applied);
    assert_eq!(target.read_file("note.md"), "hello");
    assert_eq!(
        progress
            .events()
            .iter()
            .any(|event| event.direction == SyncDirection::Pull
                && event.phase == SyncPhase::Applying),
        true
    );
}

#[tokio::test]
async fn pull_workspace_fetches_base_payloads_for_markdown_only() {
    let remote_source = Harness::new("sync-client-pull-base-source");
    remote_source.write_file("note.md", "alpha\nshared\nomega\n");
    remote_source.write_file("data.txt", "base-data");
    let base_prepared = remote_source.prepare_committed("commit-1");

    remote_source.write_file("note.md", "alpha\nshared\nomega remote\n");
    remote_source.write_file("data.txt", "remote-data");
    let current_prepared = remote_source.prepare_committed("commit-2");

    let target = Harness::new("sync-client-pull-base-target");
    target.write_file("note.md", "alpha\nshared\nomega\n");
    target.write_file("data.txt", "base-data");

    let initial_scan = scan_workspace(&target.workspace, &target.store(), ScanOptions::default())
        .expect("initial scan should succeed");
    for entry in &initial_scan.entries {
        target.delete_sync_entry(&entry.entry_id);
    }
    let base_files = base_prepared
        .manifest
        .entries
        .iter()
        .filter_map(|entry| match entry {
            LocalSyncManifestEntry::File {
                entry_id,
                name,
                blob_id,
                content_hash,
                ..
            } => Some((
                name.as_str(),
                (entry_id.as_str(), blob_id.as_str(), content_hash.as_str()),
            )),
            LocalSyncManifestEntry::Dir { .. } => None,
        })
        .collect::<HashMap<_, _>>();

    for entry in initial_scan
        .entries
        .iter()
        .filter(|entry| entry.kind == "file")
    {
        let path = target.workspace.join(&entry.name);
        let metadata = fs::metadata(&path).expect("metadata should exist");
        let (remote_entry_id, remote_blob_id, remote_content_hash) = base_files
            .get(entry.name.as_str())
            .map(|(entry_id, blob_id, content_hash)| (*entry_id, *blob_id, *content_hash))
            .expect("base manifest file should exist");

        target.upsert_sync_entry(sync_engine::UpsertSyncEntryInput {
            entry_id: remote_entry_id.to_string(),
            parent_entry_id: None,
            name: entry.name.clone(),
            kind: "file".to_string(),
            local_path: entry.name.clone(),
            last_known_size: i64::try_from(metadata.len()).ok(),
            last_known_mtime_ns: modified_time_ns(&path),
            last_known_content_hash: Some(remote_content_hash.to_string()),
            last_synced_blob_id: Some(remote_blob_id.to_string()),
            last_synced_content_hash: Some(remote_content_hash.to_string()),
            sync_state: "synced".to_string(),
        });
    }

    target.save_sync_vault_state(sync_engine::SaveSyncVaultStateInput {
        remote_vault_id: Some("vault-1".to_string()),
        last_synced_commit_id: Some("commit-1".to_string()),
        current_key_version: 1,
        last_remote_head_seen: Some("commit-1".to_string()),
        last_scan_at: None,
    });

    target.write_file("note.md", "alpha local\nshared\nomega\n");
    target.write_file("data.txt", "local-data");

    let current_files = current_prepared
        .file_blobs
        .iter()
        .map(|blob| (blob.blob_id.clone(), blob))
        .collect::<HashMap<_, _>>();
    let base_files_by_entry_id = base_prepared
        .manifest
        .entries
        .iter()
        .filter_map(|entry| match entry {
            LocalSyncManifestEntry::File {
                entry_id, blob_id, ..
            } => Some((entry_id.clone(), blob_id.clone())),
            LocalSyncManifestEntry::Dir { .. } => None,
        })
        .collect::<HashMap<_, _>>();
    let base_blobs = base_prepared
        .file_blobs
        .iter()
        .map(|blob| (blob.blob_id.clone(), blob))
        .collect::<HashMap<_, _>>();

    let mut extra_blobs = HashMap::new();
    extra_blobs.insert(
        base_prepared.manifest_blob.blob_id.clone(),
        RemoteBlobEnvelope {
            blob_id: base_prepared.manifest_blob.blob_id.clone(),
            ciphertext_hash: base_prepared.manifest_blob.ciphertext_hash.clone(),
            ciphertext_base64: base_prepared.manifest_blob.ciphertext_base64.clone(),
            nonce_base64: base_prepared.manifest_blob.nonce_base64.clone(),
            ciphertext_size: base_prepared.manifest_blob.ciphertext_size,
            kind: "manifest".to_string(),
            vault_id: "1".to_string(),
        },
    );
    for blob in current_prepared.file_blobs.iter() {
        extra_blobs.insert(
            blob.blob_id.clone(),
            RemoteBlobEnvelope {
                blob_id: blob.blob_id.clone(),
                ciphertext_hash: blob.ciphertext_hash.clone(),
                ciphertext_base64: blob.ciphertext_base64.clone(),
                nonce_base64: blob.nonce_base64.clone(),
                ciphertext_size: blob.ciphertext_size,
                kind: "file".to_string(),
                vault_id: "1".to_string(),
            },
        );
    }
    for blob in base_prepared.file_blobs.iter() {
        extra_blobs.insert(
            blob.blob_id.clone(),
            RemoteBlobEnvelope {
                blob_id: blob.blob_id.clone(),
                ciphertext_hash: blob.ciphertext_hash.clone(),
                ciphertext_base64: blob.ciphertext_base64.clone(),
                nonce_base64: blob.nonce_base64.clone(),
                ciphertext_size: blob.ciphertext_size,
                kind: "file".to_string(),
                vault_id: "1".to_string(),
            },
        );
    }

    let remote = MockRemote {
        head: SyncRemoteHead {
            current_head_commit_id: Some("commit-2".to_string()),
            current_key_version: 2,
            ..MockRemote::default().head
        },
        commit_record: RemoteCommitRecord {
            commit_id: "commit-2".to_string(),
            base_commit_id: Some("commit-1".to_string()),
            manifest_blob_id: current_prepared.manifest_blob.blob_id.clone(),
            manifest_ciphertext_hash: current_prepared.manifest_blob.ciphertext_hash.clone(),
            key_version: 2,
            ..MockRemote::default().commit_record
        },
        manifest_blob: RemoteBlobEnvelope {
            blob_id: current_prepared.manifest_blob.blob_id.clone(),
            ciphertext_hash: current_prepared.manifest_blob.ciphertext_hash.clone(),
            ciphertext_base64: current_prepared.manifest_blob.ciphertext_base64.clone(),
            nonce_base64: current_prepared.manifest_blob.nonce_base64.clone(),
            ciphertext_size: current_prepared.manifest_blob.ciphertext_size,
            ..MockRemote::default().manifest_blob
        },
        file_blob: {
            let note_blob_id = current_prepared
                .manifest
                .entries
                .iter()
                .find_map(|entry| match entry {
                    LocalSyncManifestEntry::File { name, blob_id, .. } if name == "note.md" => {
                        Some(blob_id.clone())
                    }
                    _ => None,
                })
                .expect("note blob should exist");
            let note_blob = current_files
                .get(&note_blob_id)
                .expect("current note blob should exist");
            RemoteBlobEnvelope {
                blob_id: note_blob.blob_id.clone(),
                ciphertext_hash: note_blob.ciphertext_hash.clone(),
                ciphertext_base64: note_blob.ciphertext_base64.clone(),
                nonce_base64: note_blob.nonce_base64.clone(),
                ciphertext_size: note_blob.ciphertext_size,
                kind: "file".to_string(),
                vault_id: "1".to_string(),
            }
        },
        extra_commits: HashMap::from([(
            "commit-1".to_string(),
            RemoteCommitRecord {
                commit_id: "commit-1".to_string(),
                manifest_blob_id: base_prepared.manifest_blob.blob_id.clone(),
                manifest_ciphertext_hash: base_prepared.manifest_blob.ciphertext_hash.clone(),
                ..MockRemote::default().commit_record
            },
        )]),
        extra_blobs,
        ..MockRemote::default()
    };

    let result = pull_workspace(
        PullWorkspaceInput {
            session_id: 10,
            workspace_root: target.workspace.clone(),
            db_path: target.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            vault_key_hex: remote_source.vault_key_hex(),
            max_file_size_bytes: None,
        },
        target.store(),
        &remote,
        &MockProgressSink::default(),
    )
    .await
    .expect("pull should succeed");

    assert_eq!(result.outcome, PullWorkspaceOutcome::Applied);
    assert_eq!(
        target.read_file("note.md"),
        "alpha local\nshared\nomega remote\n"
    );
    assert_eq!(target.read_file("data.txt"), "local-data");

    let note_base_blob_id = base_files_by_entry_id
        .get(
            current_prepared
                .manifest
                .entries
                .iter()
                .find_map(|entry| match entry {
                    LocalSyncManifestEntry::File { name, entry_id, .. } if name == "note.md" => {
                        Some(entry_id)
                    }
                    _ => None,
                })
                .expect("note entry id should exist"),
        )
        .expect("base note blob id should exist");
    let txt_base_blob_id = base_files_by_entry_id
        .get(
            current_prepared
                .manifest
                .entries
                .iter()
                .find_map(|entry| match entry {
                    LocalSyncManifestEntry::File { name, entry_id, .. } if name == "data.txt" => {
                        Some(entry_id)
                    }
                    _ => None,
                })
                .expect("txt entry id should exist"),
        )
        .expect("base txt blob id should exist");
    let blob_requests = remote.blob_requests();
    assert!(blob_requests.contains(note_base_blob_id));
    assert!(!blob_requests.contains(txt_base_blob_id));
    assert!(base_blobs.contains_key(note_base_blob_id));
}

#[tokio::test]
async fn pull_workspace_returns_empty_remote_when_head_is_missing() {
    let harness = Harness::new("sync-client-empty-remote");
    let remote = MockRemote::default();

    let result = pull_workspace(
        PullWorkspaceInput {
            session_id: 4,
            workspace_root: harness.workspace.clone(),
            db_path: harness.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            vault_key_hex: harness.vault_key_hex(),
            max_file_size_bytes: None,
        },
        harness.store(),
        &remote,
        &MockProgressSink::default(),
    )
    .await
    .expect("pull should succeed");

    assert_eq!(result.outcome, PullWorkspaceOutcome::EmptyRemote);
    assert_eq!(result.manifest, None);
}

#[tokio::test]
async fn pull_workspace_skips_apply_when_head_is_already_synced() {
    let source = Harness::new("sync-client-pull-up-to-date-source");
    source.write_file("note.md", "hello");
    let prepared = source.prepare_encrypted();

    let target = Harness::new("sync-client-pull-up-to-date-target");
    let remote = MockRemote {
        head: SyncRemoteHead {
            current_head_commit_id: Some("commit-1".to_string()),
            current_key_version: 2,
            ..MockRemote::default().head
        },
        commit_record: RemoteCommitRecord {
            manifest_blob_id: prepared.manifest_blob.blob_id.clone(),
            manifest_ciphertext_hash: prepared.manifest_blob.ciphertext_hash.clone(),
            key_version: 2,
            ..MockRemote::default().commit_record
        },
        manifest_blob: RemoteBlobEnvelope {
            blob_id: prepared.manifest_blob.blob_id.clone(),
            ciphertext_hash: prepared.manifest_blob.ciphertext_hash.clone(),
            ciphertext_base64: prepared.manifest_blob.ciphertext_base64.clone(),
            nonce_base64: prepared.manifest_blob.nonce_base64.clone(),
            ciphertext_size: prepared.manifest_blob.ciphertext_size,
            ..MockRemote::default().manifest_blob
        },
        file_blob: RemoteBlobEnvelope {
            blob_id: prepared.file_blobs[0].blob_id.clone(),
            ciphertext_hash: prepared.file_blobs[0].ciphertext_hash.clone(),
            ciphertext_base64: prepared.file_blobs[0].ciphertext_base64.clone(),
            nonce_base64: prepared.file_blobs[0].nonce_base64.clone(),
            ciphertext_size: prepared.file_blobs[0].ciphertext_size,
            ..MockRemote::default().file_blob
        },
        ..MockRemote::default()
    };

    pull_workspace(
        PullWorkspaceInput {
            session_id: 8,
            workspace_root: target.workspace.clone(),
            db_path: target.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            vault_key_hex: source.vault_key_hex(),
            max_file_size_bytes: None,
        },
        target.store(),
        &remote,
        &MockProgressSink::default(),
    )
    .await
    .expect("initial pull should succeed");

    target.write_file("note.md", "local edit");
    let progress = MockProgressSink::default();

    let result = pull_workspace(
        PullWorkspaceInput {
            session_id: 9,
            workspace_root: target.workspace.clone(),
            db_path: target.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            vault_key_hex: source.vault_key_hex(),
            max_file_size_bytes: None,
        },
        target.store(),
        &remote,
        &progress,
    )
    .await
    .expect("repeat pull should succeed");

    assert_eq!(result.outcome, PullWorkspaceOutcome::AlreadyUpToDate);
    assert_eq!(result.files_applied, Some(0));
    assert_eq!(target.read_file("note.md"), "local edit");
    assert_eq!(
        progress
            .events()
            .into_iter()
            .map(|event| event.phase)
            .collect::<Vec<_>>(),
        vec![
            SyncPhase::Starting,
            SyncPhase::Downloading,
            SyncPhase::Finished
        ]
    );
}

#[tokio::test]
async fn push_workspace_maps_commit_conflict_from_remote() {
    let harness = Harness::new("sync-client-push-commit-conflict");
    harness.write_file("note.md", "hello");
    let remote = MockRemote {
        commit_result: Err(SyncClientError::HeadConflict {
            current_head_commit_id: Some("commit-2".to_string()),
        }),
        ..MockRemote::default()
    };

    let error = push_workspace(
        PushWorkspaceInput {
            session_id: 5,
            workspace_root: harness.workspace.clone(),
            db_path: harness.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            device_id: "device-1".to_string(),
            vault_key_hex: harness.vault_key_hex(),
            max_file_size_bytes: None,
        },
        harness.store(),
        &remote,
        &MockProgressSink::default(),
    )
    .await
    .expect_err("push should fail");

    assert_eq!(
        error,
        SyncClientError::HeadConflict {
            current_head_commit_id: Some("commit-2".to_string()),
        }
    );
}

#[tokio::test]
async fn pull_workspace_rejects_manifest_blob_id_mismatch() {
    let source = Harness::new("sync-client-pull-bad-manifest-id-source");
    source.write_file("note.md", "hello");
    let prepared = source.prepare_encrypted();

    let target = Harness::new("sync-client-pull-bad-manifest-id-target");
    let remote = MockRemote {
        head: SyncRemoteHead {
            current_head_commit_id: Some("commit-1".to_string()),
            current_key_version: 2,
            ..MockRemote::default().head
        },
        commit_record: RemoteCommitRecord {
            manifest_blob_id: prepared.manifest_blob.blob_id.clone(),
            manifest_ciphertext_hash: prepared.manifest_blob.ciphertext_hash.clone(),
            key_version: 2,
            ..MockRemote::default().commit_record
        },
        manifest_blob: RemoteBlobEnvelope {
            blob_id: "wrong-manifest-blob-id".to_string(),
            ciphertext_hash: prepared.manifest_blob.ciphertext_hash.clone(),
            ciphertext_base64: prepared.manifest_blob.ciphertext_base64.clone(),
            nonce_base64: prepared.manifest_blob.nonce_base64.clone(),
            ciphertext_size: prepared.manifest_blob.ciphertext_size,
            ..MockRemote::default().manifest_blob
        },
        ..MockRemote::default()
    };

    let error = pull_workspace(
        PullWorkspaceInput {
            session_id: 6,
            workspace_root: target.workspace.clone(),
            db_path: target.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            vault_key_hex: source.vault_key_hex(),
            max_file_size_bytes: None,
        },
        target.store(),
        &remote,
        &MockProgressSink::default(),
    )
    .await
    .expect_err("pull should fail");

    assert_eq!(
        error,
        SyncClientError::remote(
            "INVALID_BLOB_RESPONSE",
            format!(
                "remote blob id mismatch: expected {}, got wrong-manifest-blob-id",
                prepared.manifest_blob.blob_id
            ),
        )
    );
}

#[tokio::test]
async fn pull_workspace_rejects_file_blob_hash_mismatch() {
    let source = Harness::new("sync-client-pull-bad-file-hash-source");
    source.write_file("note.md", "hello");
    let prepared = source.prepare_encrypted();

    let target = Harness::new("sync-client-pull-bad-file-hash-target");
    let remote = MockRemote {
        head: SyncRemoteHead {
            current_head_commit_id: Some("commit-1".to_string()),
            current_key_version: 2,
            ..MockRemote::default().head
        },
        commit_record: RemoteCommitRecord {
            manifest_blob_id: prepared.manifest_blob.blob_id.clone(),
            manifest_ciphertext_hash: prepared.manifest_blob.ciphertext_hash.clone(),
            key_version: 2,
            ..MockRemote::default().commit_record
        },
        manifest_blob: RemoteBlobEnvelope {
            blob_id: prepared.manifest_blob.blob_id.clone(),
            ciphertext_hash: prepared.manifest_blob.ciphertext_hash.clone(),
            ciphertext_base64: prepared.manifest_blob.ciphertext_base64.clone(),
            nonce_base64: prepared.manifest_blob.nonce_base64.clone(),
            ciphertext_size: prepared.manifest_blob.ciphertext_size,
            ..MockRemote::default().manifest_blob
        },
        file_blob: RemoteBlobEnvelope {
            blob_id: prepared.file_blobs[0].blob_id.clone(),
            ciphertext_hash: "wrong-file-ciphertext-hash".to_string(),
            ciphertext_base64: prepared.file_blobs[0].ciphertext_base64.clone(),
            nonce_base64: prepared.file_blobs[0].nonce_base64.clone(),
            ciphertext_size: prepared.file_blobs[0].ciphertext_size,
            ..MockRemote::default().file_blob
        },
        ..MockRemote::default()
    };

    let error = pull_workspace(
        PullWorkspaceInput {
            session_id: 7,
            workspace_root: target.workspace.clone(),
            db_path: target.db_path.clone(),
            server_url: "https://sync.mdit.app".to_string(),
            vault_id: "vault-1".to_string(),
            auth_token: "token".to_string(),
            user_id: "user-1".to_string(),
            vault_key_hex: source.vault_key_hex(),
            max_file_size_bytes: None,
        },
        target.store(),
        &remote,
        &MockProgressSink::default(),
    )
    .await
    .expect_err("pull should fail");

    assert_eq!(
        error,
        SyncClientError::remote(
            "INVALID_BLOB_RESPONSE",
            format!(
                "remote blob ciphertext hash mismatch: expected {}, got wrong-file-ciphertext-hash",
                prepared.file_blobs[0].ciphertext_hash
            ),
        )
    );
}
