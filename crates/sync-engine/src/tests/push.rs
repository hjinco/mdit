use std::fs;

use crate::{
    finalize_push_workspace, prepare_push_workspace, FinalizePushInput, ScanOptions,
    SyncWorkspaceStore,
};

use super::harness::Harness;

#[test]
fn finalize_push_workspace_marks_entries_as_synced() {
    let harness = Harness::new("mdit-sync-engine-finalize-push");
    fs::create_dir_all(harness.workspace.join("notes")).expect("failed to create notes dir");
    fs::write(harness.workspace.join("notes/note.md"), b"hello").expect("failed to write note");

    let prepared = prepare_push_workspace(
        &harness.workspace,
        &harness.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("prepare push should succeed");

    let finalized = finalize_push_workspace(
        &harness.store(),
        &prepared,
        &FinalizePushInput {
            remote_vault_id: "vault-1".to_string(),
            last_synced_commit_id: "commit-1".to_string(),
            current_key_version: 2,
        },
    )
    .expect("finalize push should succeed");

    assert_eq!(
        finalized.sync_vault_state.last_synced_commit_id.as_deref(),
        Some("commit-1")
    );
    assert_eq!(finalized.sync_vault_state.current_key_version, 2);
    assert!(finalized
        .entries
        .iter()
        .all(|entry| entry.sync_state == "synced"));

    let file_entry = finalized
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("file entry should exist");
    assert_eq!(
        file_entry.last_synced_blob_id.as_deref(),
        Some(prepared.file_blobs[0].blob_id.as_str())
    );
    assert_eq!(
        file_entry.last_synced_content_hash.as_deref(),
        file_entry.last_known_content_hash.as_deref()
    );
}

#[test]
fn prepare_push_workspace_does_not_persist_snapshot_state() {
    let harness = Harness::new("mdit-sync-engine-prepare-push-no-persist");
    fs::write(harness.workspace.join("note.md"), b"hello").expect("failed to write note");

    let prepared = prepare_push_workspace(
        &harness.workspace,
        &harness.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("prepare push should succeed");

    assert_eq!(prepared.entries.len(), 1);
    assert_eq!(
        harness
            .store()
            .list_sync_entries()
            .expect("entries should load")
            .len(),
        0
    );
}

#[test]
fn finalize_push_workspace_persists_deletions_only_after_success() {
    let harness = Harness::new("mdit-sync-engine-finalize-push-delete");
    fs::write(harness.workspace.join("note.md"), b"hello").expect("failed to write note");

    let initial = prepare_push_workspace(
        &harness.workspace,
        &harness.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("initial prepare push should succeed");
    finalize_push_workspace(
        &harness.store(),
        &initial,
        &FinalizePushInput {
            remote_vault_id: "vault-1".to_string(),
            last_synced_commit_id: "commit-1".to_string(),
            current_key_version: 1,
        },
    )
    .expect("initial finalize should succeed");

    fs::remove_file(harness.workspace.join("note.md")).expect("failed to remove note");
    let deletion = prepare_push_workspace(
        &harness.workspace,
        &harness.store(),
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        ScanOptions::default(),
    )
    .expect("delete prepare push should succeed");

    assert_eq!(deletion.deleted_entry_ids.len(), 1);
    assert_eq!(
        harness
            .store()
            .list_sync_entries()
            .expect("entries should load before finalize")
            .len(),
        1
    );

    let finalized = finalize_push_workspace(
        &harness.store(),
        &deletion,
        &FinalizePushInput {
            remote_vault_id: "vault-1".to_string(),
            last_synced_commit_id: "commit-2".to_string(),
            current_key_version: 1,
        },
    )
    .expect("delete finalize should succeed");

    assert!(finalized.entries.is_empty());
    assert!(harness
        .store()
        .list_sync_entries()
        .expect("entries should load after finalize")
        .is_empty());
}
