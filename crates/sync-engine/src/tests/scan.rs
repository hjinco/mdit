use std::fs;
#[cfg(unix)]
use std::os::unix::{fs::symlink, fs::PermissionsExt};
use std::thread;
use std::time::Duration;

use crate::{scan_workspace, LocalSyncManifestEntry, ScanOptions};

use super::harness::Harness;

#[test]
fn scan_workspace_builds_manifest_and_persists_entries() {
    let harness = Harness::new("mdit-sync-engine-scan");
    fs::create_dir_all(harness.workspace.join("notes")).expect("failed to create dir");
    fs::write(harness.workspace.join("notes/note.md"), b"hello world")
        .expect("failed to write note");
    fs::write(harness.workspace.join(".hidden"), b"ignored").expect("failed to write hidden");

    let result = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("scan should succeed");

    assert_eq!(result.files_scanned, 1);
    assert_eq!(result.directories_scanned, 1);
    assert_eq!(result.entries.len(), 2);
    assert_eq!(result.exclusion_events.len(), 0);
    assert_eq!(result.manifest.entries.len(), 2);

    let file_entry = result
        .manifest
        .entries
        .iter()
        .find_map(|entry| match entry {
            LocalSyncManifestEntry::File {
                name, content_hash, ..
            } => Some((name.clone(), content_hash.clone())),
            LocalSyncManifestEntry::Dir { .. } => None,
        })
        .expect("file entry should exist");
    assert_eq!(file_entry.0, "note.md");
    assert!(!file_entry.1.is_empty());
}

#[test]
fn scan_workspace_reuses_entry_ids_and_records_size_exclusions() {
    let harness = Harness::new("mdit-sync-engine-reuse");
    fs::write(harness.workspace.join("note.md"), b"abc").expect("failed to write note");

    let first = scan_workspace(
        &harness.workspace,
        &harness.store(),
        ScanOptions {
            max_file_size_bytes: None,
        },
    )
    .expect("first scan should succeed");

    let first_file_id = first
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .map(|entry| entry.entry_id.clone())
        .expect("file id should exist");

    let second = scan_workspace(
        &harness.workspace,
        &harness.store(),
        ScanOptions {
            max_file_size_bytes: Some(1),
        },
    )
    .expect("second scan should succeed");

    assert_eq!(second.entries.len(), 0);
    assert_eq!(second.entries_deleted, 1);
    assert_eq!(second.exclusion_events.len(), 1);
    assert_eq!(second.exclusion_events[0].reason, "size_limit_exceeded");

    fs::write(harness.workspace.join("note.md"), b"abc").expect("failed to rewrite note");
    let third = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("third scan should succeed");
    let third_file_id = third
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .map(|entry| entry.entry_id.clone())
        .expect("file id should exist");

    assert_ne!(first_file_id, String::new());
    assert_ne!(third_file_id, String::new());
}

#[test]
fn scan_workspace_reuses_file_entry_id_after_rename() {
    let harness = Harness::new("mdit-sync-engine-rename");
    fs::write(harness.workspace.join("note.md"), b"abc").expect("failed to write note");

    let first = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("first scan should succeed");
    let first_file = first
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("file entry should exist");

    fs::rename(
        harness.workspace.join("note.md"),
        harness.workspace.join("renamed.md"),
    )
    .expect("failed to rename note");

    let second = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("second scan should succeed");
    let second_file = second
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("file entry should exist");

    assert_eq!(second.entries_deleted, 0);
    assert_eq!(first_file.entry_id, second_file.entry_id);
    assert_eq!(second_file.local_path, "renamed.md");
}

#[test]
fn scan_workspace_reuses_file_entry_id_after_move() {
    let harness = Harness::new("mdit-sync-engine-move");
    fs::create_dir_all(harness.workspace.join("notes")).expect("failed to create notes dir");
    fs::create_dir_all(harness.workspace.join("archive")).expect("failed to create archive dir");
    fs::write(harness.workspace.join("notes/note.md"), b"abc").expect("failed to write note");

    let first = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("first scan should succeed");
    let first_file = first
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("file entry should exist");

    fs::rename(
        harness.workspace.join("notes/note.md"),
        harness.workspace.join("archive/note.md"),
    )
    .expect("failed to move note");

    let second = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("second scan should succeed");
    let second_file = second
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("file entry should exist");

    assert_eq!(first_file.entry_id, second_file.entry_id);
    assert_eq!(second_file.local_path, "archive/note.md");
}

#[test]
fn scan_workspace_prefers_exact_path_match_over_same_content_candidates() {
    let harness = Harness::new("mdit-sync-engine-exact-path");
    fs::write(harness.workspace.join("keep.md"), b"abc").expect("failed to write keep");
    fs::write(harness.workspace.join("move.md"), b"abc").expect("failed to write move");

    let first = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("first scan should succeed");
    let keep_entry = first
        .entries
        .iter()
        .find(|entry| entry.local_path == "keep.md")
        .expect("keep entry should exist");

    fs::rename(
        harness.workspace.join("move.md"),
        harness.workspace.join("renamed.md"),
    )
    .expect("failed to rename move file");

    let second = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("second scan should succeed");
    let keep_entry_after = second
        .entries
        .iter()
        .find(|entry| entry.local_path == "keep.md")
        .expect("keep entry should still exist");

    assert_eq!(keep_entry.entry_id, keep_entry_after.entry_id);
}

#[test]
fn scan_workspace_does_not_reuse_ambiguous_duplicate_content_ids() {
    let harness = Harness::new("mdit-sync-engine-duplicate-content");
    fs::write(harness.workspace.join("a.md"), b"same").expect("failed to write a");
    fs::write(harness.workspace.join("b.md"), b"same").expect("failed to write b");

    let first = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("first scan should succeed");
    let first_ids = first
        .entries
        .iter()
        .filter(|entry| entry.kind == "file")
        .map(|entry| entry.entry_id.clone())
        .collect::<Vec<_>>();

    fs::rename(
        harness.workspace.join("a.md"),
        harness.workspace.join("c.md"),
    )
    .expect("failed to rename a");
    fs::remove_file(harness.workspace.join("b.md")).expect("failed to remove b");

    let second = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("second scan should succeed");
    let second_entry = second
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("file should exist after rename");

    assert_eq!(second.entries_deleted, 2);
    assert!(!first_ids.contains(&second_entry.entry_id));
}

#[test]
fn scan_workspace_reuses_directory_entry_id_after_move() {
    let harness = Harness::new("mdit-sync-engine-dir-move");
    fs::create_dir_all(harness.workspace.join("notes")).expect("failed to create notes dir");
    fs::create_dir_all(harness.workspace.join("archive")).expect("failed to create archive dir");
    fs::write(harness.workspace.join("notes/note.md"), b"abc").expect("failed to write note");

    let first = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("first scan should succeed");
    let first_dir = first
        .entries
        .iter()
        .find(|entry| entry.kind == "dir" && entry.name == "notes")
        .expect("notes dir should exist");

    fs::rename(
        harness.workspace.join("notes"),
        harness.workspace.join("archive/notes"),
    )
    .expect("failed to move notes dir");

    let second = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("second scan should succeed");
    let second_dir = second
        .entries
        .iter()
        .find(|entry| entry.kind == "dir" && entry.name == "notes")
        .expect("notes dir should exist after move");

    assert_eq!(first_dir.entry_id, second_dir.entry_id);
    assert_eq!(second_dir.local_path, "archive/notes");
}

#[test]
fn scan_workspace_keeps_synced_state_until_content_changes() {
    let harness = Harness::new("mdit-sync-engine-sync-state");
    fs::write(harness.workspace.join("note.md"), b"abc").expect("failed to write note");

    let first = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("first scan should succeed");
    let first_file = first
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("file should exist");
    let first_hash = first_file
        .last_known_content_hash
        .clone()
        .expect("hash should exist");

    app_storage::sync_state::upsert_sync_entry(
        &harness.db_path,
        &harness.workspace,
        &app_storage::sync_state::UpsertSyncEntryInput {
            entry_id: first_file.entry_id.clone(),
            parent_entry_id: None,
            name: "note.md".to_string(),
            kind: "file".to_string(),
            local_path: "note.md".to_string(),
            last_known_size: first_file.last_known_size,
            last_known_mtime_ns: first_file.last_known_mtime_ns,
            last_known_content_hash: Some(first_hash.clone()),
            last_synced_blob_id: Some("blob-1".to_string()),
            last_synced_content_hash: Some(first_hash),
            sync_state: "synced".to_string(),
        },
    )
    .expect("upsert should succeed");

    let second = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("second scan should succeed");
    let second_file = second
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("file should exist");
    assert_eq!(second_file.sync_state, "synced");

    fs::write(harness.workspace.join("note.md"), b"changed").expect("failed to modify note");
    let third = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("third scan should succeed");
    let third_file = third
        .entries
        .iter()
        .find(|entry| entry.kind == "file")
        .expect("file should exist");
    assert_eq!(third_file.sync_state, "pending");
}

#[cfg(unix)]
#[test]
fn scan_workspace_records_symlink_exclusions() {
    let harness = Harness::new("mdit-sync-engine-symlink");
    fs::write(harness.workspace.join("real.md"), b"abc").expect("failed to write real file");
    symlink(
        harness.workspace.join("real.md"),
        harness.workspace.join("linked.md"),
    )
    .expect("failed to create symlink");

    let result = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("scan should succeed");

    assert_eq!(result.entries.len(), 1);
    assert_eq!(result.exclusion_events.len(), 1);
    assert_eq!(result.exclusion_events[0].reason, "symlink");
    assert_eq!(result.exclusion_events[0].local_path, "linked.md");
}

#[cfg(unix)]
#[test]
fn scan_workspace_records_read_failures() {
    let harness = Harness::new("mdit-sync-engine-read-fail");
    let file_path = harness.workspace.join("locked.md");
    fs::write(&file_path, b"secret").expect("failed to write locked file");

    let mut permissions = fs::metadata(&file_path)
        .expect("metadata should exist")
        .permissions();
    permissions.set_mode(0o000);
    fs::set_permissions(&file_path, permissions).expect("failed to lock file");

    let result = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("scan should succeed");

    assert_eq!(result.entries.len(), 0);
    assert_eq!(result.exclusion_events.len(), 1);
    assert_eq!(result.exclusion_events[0].reason, "read_failed");
}

#[test]
fn scan_workspace_deletes_stale_entries_and_updates_last_scan_at() {
    let harness = Harness::new("mdit-sync-engine-stale-delete");
    fs::write(harness.workspace.join("note.md"), b"abc").expect("failed to write note");

    let first = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("first scan should succeed");
    let first_scan_at = first
        .sync_vault_state
        .last_scan_at
        .clone()
        .expect("first scan time should exist")
        .parse::<u128>()
        .expect("first scan time should parse");

    fs::remove_file(harness.workspace.join("note.md")).expect("failed to remove note");
    thread::sleep(Duration::from_millis(2));

    let second = scan_workspace(&harness.workspace, &harness.store(), ScanOptions::default())
        .expect("second scan should succeed");
    let second_scan_at = second
        .sync_vault_state
        .last_scan_at
        .clone()
        .expect("second scan time should exist")
        .parse::<u128>()
        .expect("second scan time should parse");

    assert_eq!(second.entries_deleted, 1);
    assert!(second.entries.is_empty());
    assert!(second_scan_at >= first_scan_at);
}
