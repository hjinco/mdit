use std::fs;
#[cfg(unix)]
use std::os::unix::fs::symlink;

use app_storage::sync_state::list_open_sync_conflicts;
use base64::Engine;

use crate::{
    apply_remote_workspace, decrypt_file_blob, prepare_encrypted_workspace, scan_workspace,
    ApplyRemoteSyncFileInput, ApplyRemoteWorkspaceInput, DecryptFileBlobInput, LocalSyncManifest,
    LocalSyncManifestEntry, ScanOptions,
};

use super::harness::Harness;

fn build_apply_files(
    prepared: &crate::PreparedSyncWorkspaceResult,
    vault_key_hex: &str,
) -> Vec<ApplyRemoteSyncFileInput> {
    prepared
        .manifest
        .entries
        .iter()
        .filter_map(|entry| match entry {
            LocalSyncManifestEntry::File {
                entry_id,
                parent_entry_id,
                name,
                blob_id,
                content_hash,
                size,
                modified_at,
            } => {
                let prepared_blob = prepared
                    .file_blobs
                    .iter()
                    .find(|blob| blob.entry_id.as_deref() == Some(entry_id.as_str()))
                    .expect("file blob should exist");
                let decrypted = decrypt_file_blob(DecryptFileBlobInput {
                    vault_key_hex: vault_key_hex.to_string(),
                    vault_id: prepared.sync_vault_state.vault_id,
                    kind: "file".to_string(),
                    ciphertext_base64: prepared_blob.ciphertext_base64.clone(),
                    nonce_base64: prepared_blob.nonce_base64.clone(),
                })
                .expect("file decrypt should succeed");

                Some(ApplyRemoteSyncFileInput {
                    entry_id: entry_id.clone(),
                    parent_entry_id: parent_entry_id.clone(),
                    name: name.clone(),
                    blob_id: blob_id.clone(),
                    content_hash: content_hash.clone(),
                    size: *size,
                    modified_at: *modified_at,
                    plaintext_base64: decrypted.plaintext_base64,
                    base_plaintext_base64: None,
                })
            }
            LocalSyncManifestEntry::Dir { .. } => None,
        })
        .collect()
}

#[test]
fn apply_remote_workspace_writes_files_and_updates_sync_state() {
    let source = Harness::new("mdit-sync-engine-apply-source");
    fs::create_dir_all(source.workspace.join("notes")).expect("failed to create notes dir");
    fs::write(source.workspace.join("notes/note.md"), b"abc").expect("failed to write note");

    let prepared = prepare_encrypted_workspace(
        &source.workspace,
        &source.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("encrypted workspace preparation should succeed");

    let target = Harness::new("mdit-sync-engine-apply-target");
    fs::write(target.workspace.join("stale.md"), b"stale").expect("failed to write stale");

    let files = build_apply_files(
        &prepared,
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    );

    let applied = apply_remote_workspace(
        &target.workspace,
        &target.store(),
        ApplyRemoteWorkspaceInput {
            manifest: prepared.manifest.clone(),
            files,
            remote_vault_id: "remote-vault-1".to_string(),
            last_synced_commit_id: "commit-1".to_string(),
            current_key_version: 2,
        },
    )
    .expect("remote workspace apply should succeed");

    assert_eq!(
        fs::read(target.workspace.join("notes/note.md")).expect("applied note should exist"),
        b"abc"
    );
    assert!(!target.workspace.join("stale.md").exists());
    assert_eq!(applied.files_applied, 1);
    assert_eq!(applied.entries_deleted, 0);
    assert_eq!(
        applied.sync_vault_state.remote_vault_id.as_deref(),
        Some("remote-vault-1")
    );
    assert_eq!(
        applied.sync_vault_state.last_synced_commit_id.as_deref(),
        Some("commit-1")
    );
    assert_eq!(applied.sync_vault_state.current_key_version, 2);
    assert_eq!(applied.entries.len(), prepared.manifest.entries.len());
    let expected_blob_id = prepared
        .manifest
        .entries
        .iter()
        .find_map(|entry| match entry {
            LocalSyncManifestEntry::File { blob_id, .. } => Some(blob_id.as_str()),
            LocalSyncManifestEntry::Dir { .. } => None,
        })
        .expect("manifest file entry should exist");

    let synced_file = applied
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("synced file entry should exist");
    assert_eq!(
        synced_file.last_synced_blob_id.as_deref(),
        Some(expected_blob_id)
    );
}

#[test]
fn apply_remote_workspace_merges_markdown_when_base_payload_is_present() {
    let base = "alpha\nshared\nomega\n";
    let local = "alpha local\nshared\nomega\n";
    let remote = "alpha\nshared\nomega remote\n";

    let source = Harness::new("mdit-sync-engine-apply-markdown-merge-source");
    fs::write(source.workspace.join("note.md"), remote).expect("failed to write remote note");
    let prepared = prepare_encrypted_workspace(
        &source.workspace,
        &source.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("encrypted workspace preparation should succeed");

    let target = Harness::new("mdit-sync-engine-apply-markdown-merge-target");
    fs::write(target.workspace.join("note.md"), base).expect("failed to write base");
    let initial_scan = scan_workspace(&target.workspace, &target.store(), ScanOptions::default())
        .expect("initial scan should succeed");
    let initial_entry = initial_scan
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("initial file entry should exist");
    let base_hash = initial_entry
        .last_known_content_hash
        .clone()
        .expect("initial hash should exist");

    app_storage::sync_state::upsert_sync_entry(
        &target.db_path,
        &target.workspace,
        &app_storage::sync_state::UpsertSyncEntryInput {
            entry_id: initial_entry.entry_id.clone(),
            parent_entry_id: None,
            name: "note.md".to_string(),
            kind: "file".to_string(),
            local_path: "note.md".to_string(),
            last_known_size: initial_entry.last_known_size,
            last_known_mtime_ns: initial_entry.last_known_mtime_ns,
            last_known_content_hash: Some(base_hash.clone()),
            last_synced_blob_id: Some("blob-base".to_string()),
            last_synced_content_hash: Some(base_hash),
            sync_state: "synced".to_string(),
        },
    )
    .expect("upsert should succeed");

    fs::write(target.workspace.join("note.md"), local).expect("failed to write local edit");

    let prepared_blob = prepared.file_blobs.first().expect("file blob should exist");
    let decrypted = decrypt_file_blob(DecryptFileBlobInput {
        vault_key_hex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
            .to_string(),
        vault_id: prepared.sync_vault_state.vault_id,
        kind: "file".to_string(),
        ciphertext_base64: prepared_blob.ciphertext_base64.clone(),
        nonce_base64: prepared_blob.nonce_base64.clone(),
    })
    .expect("file decrypt should succeed");

    let remote_manifest = LocalSyncManifest {
        entries: prepared
            .manifest
            .entries
            .iter()
            .map(|entry| match entry {
                LocalSyncManifestEntry::File {
                    parent_entry_id,
                    name,
                    blob_id,
                    content_hash,
                    size,
                    modified_at,
                    ..
                } => LocalSyncManifestEntry::File {
                    entry_id: initial_entry.entry_id.clone(),
                    parent_entry_id: parent_entry_id.clone(),
                    name: name.clone(),
                    blob_id: blob_id.clone(),
                    content_hash: content_hash.clone(),
                    size: *size,
                    modified_at: *modified_at,
                },
                LocalSyncManifestEntry::Dir {
                    entry_id,
                    parent_entry_id,
                    name,
                } => LocalSyncManifestEntry::Dir {
                    entry_id: entry_id.clone(),
                    parent_entry_id: parent_entry_id.clone(),
                    name: name.clone(),
                },
            })
            .collect(),
        ..prepared.manifest.clone()
    };
    let remote_manifest_file = remote_manifest
        .entries
        .iter()
        .find_map(|entry| match entry {
            LocalSyncManifestEntry::File {
                parent_entry_id,
                name,
                blob_id,
                content_hash,
                size,
                modified_at,
                ..
            } => Some((
                parent_entry_id.clone(),
                name.clone(),
                blob_id.clone(),
                content_hash.clone(),
                *size,
                *modified_at,
            )),
            LocalSyncManifestEntry::Dir { .. } => None,
        })
        .expect("manifest file entry should exist");

    apply_remote_workspace(
        &target.workspace,
        &target.store(),
        ApplyRemoteWorkspaceInput {
            manifest: remote_manifest,
            files: vec![ApplyRemoteSyncFileInput {
                entry_id: initial_entry.entry_id.clone(),
                parent_entry_id: remote_manifest_file.0,
                name: remote_manifest_file.1,
                blob_id: remote_manifest_file.2,
                content_hash: remote_manifest_file.3,
                size: remote_manifest_file.4,
                modified_at: remote_manifest_file.5,
                plaintext_base64: decrypted.plaintext_base64,
                base_plaintext_base64: Some(
                    base64::engine::general_purpose::STANDARD.encode(base.as_bytes()),
                ),
            }],
            remote_vault_id: "remote-vault-1".to_string(),
            last_synced_commit_id: "commit-2".to_string(),
            current_key_version: 2,
        },
    )
    .expect("remote workspace apply should succeed");

    assert_eq!(
        fs::read_to_string(target.workspace.join("note.md")).expect("merged note should exist"),
        "alpha local\nshared\nomega remote\n"
    );
    let conflicts = list_open_sync_conflicts(&target.db_path, &target.workspace)
        .expect("conflict list should succeed");
    assert!(conflicts.is_empty());
}

#[test]
fn apply_remote_workspace_writes_markdown_conflicts_in_place() {
    let base = "alpha\nshared\n";
    let local = "alpha local\nshared\n";
    let remote = "alpha remote\nshared\n";

    let source = Harness::new("mdit-sync-engine-apply-markdown-conflict-source");
    fs::write(source.workspace.join("note.md"), remote).expect("failed to write remote note");
    let prepared = prepare_encrypted_workspace(
        &source.workspace,
        &source.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("encrypted workspace preparation should succeed");

    let target = Harness::new("mdit-sync-engine-apply-markdown-conflict-target");
    fs::write(target.workspace.join("note.md"), base).expect("failed to write base");
    let initial_scan = scan_workspace(&target.workspace, &target.store(), ScanOptions::default())
        .expect("initial scan should succeed");
    let initial_entry = initial_scan
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("initial file entry should exist");
    let base_hash = initial_entry
        .last_known_content_hash
        .clone()
        .expect("initial hash should exist");

    app_storage::sync_state::upsert_sync_entry(
        &target.db_path,
        &target.workspace,
        &app_storage::sync_state::UpsertSyncEntryInput {
            entry_id: initial_entry.entry_id.clone(),
            parent_entry_id: None,
            name: "note.md".to_string(),
            kind: "file".to_string(),
            local_path: "note.md".to_string(),
            last_known_size: initial_entry.last_known_size,
            last_known_mtime_ns: initial_entry.last_known_mtime_ns,
            last_known_content_hash: Some(base_hash.clone()),
            last_synced_blob_id: Some("blob-base".to_string()),
            last_synced_content_hash: Some(base_hash),
            sync_state: "synced".to_string(),
        },
    )
    .expect("upsert should succeed");

    fs::write(target.workspace.join("note.md"), local).expect("failed to write local edit");

    let prepared_blob = prepared.file_blobs.first().expect("file blob should exist");
    let decrypted = decrypt_file_blob(DecryptFileBlobInput {
        vault_key_hex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
            .to_string(),
        vault_id: prepared.sync_vault_state.vault_id,
        kind: "file".to_string(),
        ciphertext_base64: prepared_blob.ciphertext_base64.clone(),
        nonce_base64: prepared_blob.nonce_base64.clone(),
    })
    .expect("file decrypt should succeed");

    let remote_manifest = LocalSyncManifest {
        entries: prepared
            .manifest
            .entries
            .iter()
            .map(|entry| match entry {
                LocalSyncManifestEntry::File {
                    parent_entry_id,
                    name,
                    blob_id,
                    content_hash,
                    size,
                    modified_at,
                    ..
                } => LocalSyncManifestEntry::File {
                    entry_id: initial_entry.entry_id.clone(),
                    parent_entry_id: parent_entry_id.clone(),
                    name: name.clone(),
                    blob_id: blob_id.clone(),
                    content_hash: content_hash.clone(),
                    size: *size,
                    modified_at: *modified_at,
                },
                LocalSyncManifestEntry::Dir {
                    entry_id,
                    parent_entry_id,
                    name,
                } => LocalSyncManifestEntry::Dir {
                    entry_id: entry_id.clone(),
                    parent_entry_id: parent_entry_id.clone(),
                    name: name.clone(),
                },
            })
            .collect(),
        ..prepared.manifest.clone()
    };
    let remote_manifest_file = remote_manifest
        .entries
        .iter()
        .find_map(|entry| match entry {
            LocalSyncManifestEntry::File {
                parent_entry_id,
                name,
                blob_id,
                content_hash,
                size,
                modified_at,
                ..
            } => Some((
                parent_entry_id.clone(),
                name.clone(),
                blob_id.clone(),
                content_hash.clone(),
                *size,
                *modified_at,
            )),
            LocalSyncManifestEntry::Dir { .. } => None,
        })
        .expect("manifest file entry should exist");

    apply_remote_workspace(
        &target.workspace,
        &target.store(),
        ApplyRemoteWorkspaceInput {
            manifest: remote_manifest,
            files: vec![ApplyRemoteSyncFileInput {
                entry_id: initial_entry.entry_id.clone(),
                parent_entry_id: remote_manifest_file.0,
                name: remote_manifest_file.1,
                blob_id: remote_manifest_file.2,
                content_hash: remote_manifest_file.3,
                size: remote_manifest_file.4,
                modified_at: remote_manifest_file.5,
                plaintext_base64: decrypted.plaintext_base64,
                base_plaintext_base64: Some(
                    base64::engine::general_purpose::STANDARD.encode(base.as_bytes()),
                ),
            }],
            remote_vault_id: "remote-vault-1".to_string(),
            last_synced_commit_id: "commit-2".to_string(),
            current_key_version: 2,
        },
    )
    .expect("remote workspace apply should succeed");

    let conflicted =
        fs::read_to_string(target.workspace.join("note.md")).expect("conflicted note should exist");
    assert!(conflicted.contains("<<<<<<< LOCAL"));
    assert!(conflicted.contains("local"));
    assert!(conflicted.contains("remote"));
    assert!(!target.workspace.join("note (conflict).md").exists());

    let conflicts = list_open_sync_conflicts(&target.db_path, &target.workspace)
        .expect("conflict list should succeed");
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].original_path, "note.md");
    assert_eq!(conflicts[0].conflict_path, "note.md");
    assert_eq!(conflicts[0].remote_commit_id, "commit-2");
}

#[test]
fn apply_remote_workspace_keeps_newer_non_markdown_file_in_place() {
    let source = Harness::new("mdit-sync-engine-apply-non-markdown-source");
    fs::write(source.workspace.join("note.txt"), b"remote").expect("failed to write note");
    let prepared = prepare_encrypted_workspace(
        &source.workspace,
        &source.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("encrypted workspace preparation should succeed");

    let target = Harness::new("mdit-sync-engine-apply-non-markdown-target");
    fs::write(target.workspace.join("note.txt"), b"base").expect("failed to write base");
    let initial_scan = scan_workspace(&target.workspace, &target.store(), ScanOptions::default())
        .expect("initial scan should succeed");
    let initial_entry = initial_scan
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("initial file entry should exist");
    let base_hash = initial_entry
        .last_known_content_hash
        .clone()
        .expect("initial hash should exist");

    app_storage::sync_state::upsert_sync_entry(
        &target.db_path,
        &target.workspace,
        &app_storage::sync_state::UpsertSyncEntryInput {
            entry_id: initial_entry.entry_id.clone(),
            parent_entry_id: None,
            name: "note.txt".to_string(),
            kind: "file".to_string(),
            local_path: "note.txt".to_string(),
            last_known_size: initial_entry.last_known_size,
            last_known_mtime_ns: initial_entry.last_known_mtime_ns,
            last_known_content_hash: Some(base_hash.clone()),
            last_synced_blob_id: Some("blob-base".to_string()),
            last_synced_content_hash: Some(base_hash),
            sync_state: "synced".to_string(),
        },
    )
    .expect("upsert should succeed");

    fs::write(target.workspace.join("note.txt"), b"local newer")
        .expect("failed to write local file");

    let prepared_blob = prepared.file_blobs.first().expect("file blob should exist");
    let decrypted = decrypt_file_blob(DecryptFileBlobInput {
        vault_key_hex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
            .to_string(),
        vault_id: prepared.sync_vault_state.vault_id,
        kind: "file".to_string(),
        ciphertext_base64: prepared_blob.ciphertext_base64.clone(),
        nonce_base64: prepared_blob.nonce_base64.clone(),
    })
    .expect("file decrypt should succeed");

    let remote_manifest = LocalSyncManifest {
        entries: prepared
            .manifest
            .entries
            .iter()
            .map(|entry| match entry {
                LocalSyncManifestEntry::File {
                    parent_entry_id,
                    name,
                    blob_id,
                    content_hash,
                    size,
                    ..
                } => LocalSyncManifestEntry::File {
                    entry_id: initial_entry.entry_id.clone(),
                    parent_entry_id: parent_entry_id.clone(),
                    name: name.clone(),
                    blob_id: blob_id.clone(),
                    content_hash: content_hash.clone(),
                    size: *size,
                    modified_at: 0,
                },
                LocalSyncManifestEntry::Dir {
                    entry_id,
                    parent_entry_id,
                    name,
                } => LocalSyncManifestEntry::Dir {
                    entry_id: entry_id.clone(),
                    parent_entry_id: parent_entry_id.clone(),
                    name: name.clone(),
                },
            })
            .collect(),
        ..prepared.manifest.clone()
    };
    let remote_manifest_file = remote_manifest
        .entries
        .iter()
        .find_map(|entry| match entry {
            LocalSyncManifestEntry::File {
                parent_entry_id,
                name,
                blob_id,
                content_hash,
                size,
                modified_at,
                ..
            } => Some((
                parent_entry_id.clone(),
                name.clone(),
                blob_id.clone(),
                content_hash.clone(),
                *size,
                *modified_at,
            )),
            LocalSyncManifestEntry::Dir { .. } => None,
        })
        .expect("manifest file entry should exist");

    apply_remote_workspace(
        &target.workspace,
        &target.store(),
        ApplyRemoteWorkspaceInput {
            manifest: remote_manifest,
            files: vec![ApplyRemoteSyncFileInput {
                entry_id: initial_entry.entry_id.clone(),
                parent_entry_id: remote_manifest_file.0,
                name: remote_manifest_file.1,
                blob_id: remote_manifest_file.2,
                content_hash: remote_manifest_file.3,
                size: remote_manifest_file.4,
                modified_at: remote_manifest_file.5,
                plaintext_base64: decrypted.plaintext_base64,
                base_plaintext_base64: None,
            }],
            remote_vault_id: "remote-vault-1".to_string(),
            last_synced_commit_id: "commit-2".to_string(),
            current_key_version: 2,
        },
    )
    .expect("remote workspace apply should succeed");

    assert_eq!(
        fs::read(target.workspace.join("note.txt")).expect("local file should remain"),
        b"local newer"
    );
    let conflicts = list_open_sync_conflicts(&target.db_path, &target.workspace)
        .expect("conflict list should succeed");
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].original_path, "note.txt");
    assert_eq!(conflicts[0].conflict_path, "note.txt");
}

#[test]
fn apply_remote_workspace_rejects_missing_payload_before_mutation() {
    let source = Harness::new("mdit-sync-engine-apply-missing-payload-source");
    fs::write(source.workspace.join("note.md"), b"remote").expect("failed to write note");
    let prepared = prepare_encrypted_workspace(
        &source.workspace,
        &source.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("prepare should succeed");

    let target = Harness::new("mdit-sync-engine-apply-missing-payload-target");
    fs::write(target.workspace.join("stale.md"), b"stale").expect("failed to write stale");

    let error = apply_remote_workspace(
        &target.workspace,
        &target.store(),
        ApplyRemoteWorkspaceInput {
            manifest: prepared.manifest.clone(),
            files: vec![],
            remote_vault_id: "remote-vault-1".to_string(),
            last_synced_commit_id: "commit-1".to_string(),
            current_key_version: 1,
        },
    )
    .expect_err("apply should fail");

    assert!(error.to_string().contains("Missing decrypted payload"));
    assert!(target.workspace.join("stale.md").exists());
    assert!(!target.workspace.join("note.md").exists());
}

#[test]
fn apply_remote_workspace_rejects_blob_mismatch_before_mutation() {
    let source = Harness::new("mdit-sync-engine-apply-blob-mismatch-source");
    fs::write(source.workspace.join("note.md"), b"remote").expect("failed to write note");
    let prepared = prepare_encrypted_workspace(
        &source.workspace,
        &source.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("prepare should succeed");

    let mut files = build_apply_files(
        &prepared,
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    );
    files[0].blob_id = "wrong-blob-id".to_string();

    let target = Harness::new("mdit-sync-engine-apply-blob-mismatch-target");
    fs::write(target.workspace.join("stale.md"), b"stale").expect("failed to write stale");

    let error = apply_remote_workspace(
        &target.workspace,
        &target.store(),
        ApplyRemoteWorkspaceInput {
            manifest: prepared.manifest.clone(),
            files,
            remote_vault_id: "remote-vault-1".to_string(),
            last_synced_commit_id: "commit-1".to_string(),
            current_key_version: 1,
        },
    )
    .expect_err("apply should fail");

    assert!(error.to_string().contains("Mismatched blob id"));
    assert!(target.workspace.join("stale.md").exists());
    assert!(!target.workspace.join("note.md").exists());
}

#[test]
fn apply_remote_workspace_preserves_dirty_local_file_on_remote_delete() {
    let target = Harness::new("mdit-sync-engine-apply-delete-conflict-target");
    fs::write(target.workspace.join("note.md"), b"base").expect("failed to write base");
    let initial_scan = scan_workspace(&target.workspace, &target.store(), ScanOptions::default())
        .expect("initial scan should succeed");
    let initial_entry = initial_scan
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("initial file entry should exist");
    let base_hash = initial_entry
        .last_known_content_hash
        .clone()
        .expect("initial hash should exist");

    app_storage::sync_state::upsert_sync_entry(
        &target.db_path,
        &target.workspace,
        &app_storage::sync_state::UpsertSyncEntryInput {
            entry_id: initial_entry.entry_id.clone(),
            parent_entry_id: None,
            name: "note.md".to_string(),
            kind: "file".to_string(),
            local_path: "note.md".to_string(),
            last_known_size: initial_entry.last_known_size,
            last_known_mtime_ns: initial_entry.last_known_mtime_ns,
            last_known_content_hash: Some(base_hash.clone()),
            last_synced_blob_id: Some("blob-base".to_string()),
            last_synced_content_hash: Some(base_hash),
            sync_state: "synced".to_string(),
        },
    )
    .expect("upsert should succeed");

    fs::write(target.workspace.join("note.md"), b"local dirty")
        .expect("failed to dirty local file");

    let empty_manifest = LocalSyncManifest {
        manifest_version: 1,
        vault_id: 1,
        base_commit_id: Some("commit-1".to_string()),
        generated_at: "1".to_string(),
        entries: vec![],
    };

    apply_remote_workspace(
        &target.workspace,
        &target.store(),
        ApplyRemoteWorkspaceInput {
            manifest: empty_manifest,
            files: vec![],
            remote_vault_id: "remote-vault-1".to_string(),
            last_synced_commit_id: "commit-2".to_string(),
            current_key_version: 2,
        },
    )
    .expect("apply should succeed");

    assert_eq!(
        fs::read(target.workspace.join("note.md")).expect("local file should remain"),
        b"local dirty"
    );
    assert!(!target.workspace.join("note (conflict).md").exists());

    let conflicts = list_open_sync_conflicts(&target.db_path, &target.workspace)
        .expect("conflict list should succeed");
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].original_path, "note.md");
    assert_eq!(conflicts[0].conflict_path, "note.md");
    assert_eq!(conflicts[0].remote_commit_id, "commit-2");
}

#[cfg(unix)]
#[test]
fn apply_remote_workspace_rejects_symlink_targets() {
    let source = Harness::new("mdit-sync-engine-apply-symlink-source");
    fs::write(source.workspace.join("note.md"), b"remote").expect("failed to write note");
    let prepared = prepare_encrypted_workspace(
        &source.workspace,
        &source.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("prepare should succeed");

    let target = Harness::new("mdit-sync-engine-apply-symlink-target");
    fs::write(target.workspace.join("real.md"), b"other").expect("failed to write real file");
    symlink(
        target.workspace.join("real.md"),
        target.workspace.join("note.md"),
    )
    .expect("failed to create symlink");

    let error = apply_remote_workspace(
        &target.workspace,
        &target.store(),
        ApplyRemoteWorkspaceInput {
            manifest: prepared.manifest.clone(),
            files: build_apply_files(
                &prepared,
                "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
            ),
            remote_vault_id: "remote-vault-1".to_string(),
            last_synced_commit_id: "commit-1".to_string(),
            current_key_version: 1,
        },
    )
    .expect_err("apply should fail");

    assert!(error.to_string().contains("symlink file"));
    assert!(fs::symlink_metadata(target.workspace.join("note.md")).is_ok());
}

#[test]
fn apply_remote_workspace_replaces_files_and_directories() {
    let source = Harness::new("mdit-sync-engine-apply-replace-source");
    fs::create_dir_all(source.workspace.join("folder")).expect("failed to create folder");
    fs::write(source.workspace.join("folder/note.md"), b"nested").expect("failed to write nested");
    fs::write(source.workspace.join("note.md"), b"remote").expect("failed to write note");

    let prepared = prepare_encrypted_workspace(
        &source.workspace,
        &source.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("prepare should succeed");

    let target = Harness::new("mdit-sync-engine-apply-replace-target");
    fs::write(target.workspace.join("folder"), b"file to dir")
        .expect("failed to write folder file");
    fs::create_dir_all(target.workspace.join("note.md")).expect("failed to create note dir");
    fs::write(target.workspace.join("note.md/stale.txt"), b"stale").expect("failed to write stale");

    apply_remote_workspace(
        &target.workspace,
        &target.store(),
        ApplyRemoteWorkspaceInput {
            manifest: prepared.manifest.clone(),
            files: build_apply_files(
                &prepared,
                "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
            ),
            remote_vault_id: "remote-vault-1".to_string(),
            last_synced_commit_id: "commit-1".to_string(),
            current_key_version: 1,
        },
    )
    .expect("apply should succeed");

    assert!(target.workspace.join("folder").is_dir());
    assert_eq!(
        fs::read(target.workspace.join("folder/note.md")).expect("nested note should exist"),
        b"nested"
    );
    assert!(target.workspace.join("note.md").is_file());
    assert_eq!(
        fs::read(target.workspace.join("note.md")).expect("note should exist"),
        b"remote"
    );
}

#[cfg(unix)]
#[test]
fn apply_remote_workspace_preserves_hidden_files_and_symlinks_while_removing_stale_entries() {
    let source = Harness::new("mdit-sync-engine-apply-stale-source");
    let prepared = prepare_encrypted_workspace(
        &source.workspace,
        &source.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("prepare should succeed");

    let target = Harness::new("mdit-sync-engine-apply-stale-target");
    fs::write(target.workspace.join(".hidden.md"), b"hidden").expect("failed to write hidden");
    fs::write(target.workspace.join("real.md"), b"real").expect("failed to write real");
    symlink(
        target.workspace.join("real.md"),
        target.workspace.join("linked.md"),
    )
    .expect("failed to create symlink");
    fs::write(target.workspace.join("stale.md"), b"stale").expect("failed to write stale");

    apply_remote_workspace(
        &target.workspace,
        &target.store(),
        ApplyRemoteWorkspaceInput {
            manifest: prepared.manifest.clone(),
            files: vec![],
            remote_vault_id: "remote-vault-1".to_string(),
            last_synced_commit_id: "commit-1".to_string(),
            current_key_version: 1,
        },
    )
    .expect("apply should succeed");

    assert!(target.workspace.join(".hidden.md").exists());
    assert!(fs::symlink_metadata(target.workspace.join("linked.md")).is_ok());
    assert!(!target.workspace.join("stale.md").exists());
}
