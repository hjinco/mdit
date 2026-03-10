use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use notify::event::{CreateKind, DataChange, EventAttributes, ModifyKind, RemoveKind, RenameMode};
use notify::{Event, EventKind};
use notify_debouncer_full::DebouncedEvent;

use super::PendingBatch;
use crate::entry_index::collect_entry_index;
use crate::path::is_hidden_vault_rel_path;
use crate::types::{VaultEntryKind, VaultEntryState, VaultWatchOp, VaultWatchReason};

fn event(kind: EventKind, paths: &[PathBuf]) -> Event {
    Event {
        kind,
        paths: paths.to_vec(),
        attrs: EventAttributes::new(),
    }
}

fn debounced_event(kind: EventKind, paths: &[PathBuf]) -> DebouncedEvent {
    DebouncedEvent::new(event(kind, paths), Instant::now())
}

fn debounced_event_at(kind: EventKind, paths: &[PathBuf], time: Instant) -> DebouncedEvent {
    DebouncedEvent::new(event(kind, paths), time)
}

fn temp_vault_dir() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time should move forward")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("vault-watch-observe-test-{nanos}"));
    fs::create_dir_all(&path).expect("temp vault should be created");
    path
}

fn write_file(path: &Path) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("parent should exist");
    }
    fs::write(path, "content").expect("file should be written");
}

#[test]
fn hidden_rel_path_matches_dot_prefixed_segments() {
    assert!(is_hidden_vault_rel_path(".obsidian"));
    assert!(is_hidden_vault_rel_path("docs/.cache/note.md"));
    assert!(!is_hidden_vault_rel_path("docs/note.md"));
}

#[test]
fn existing_file_deleted_in_batch_emits_missing_path_state() {
    let root = temp_vault_dir();
    let file = root.join("a.md");
    write_file(&file);
    let known_entries = collect_entry_index(&root).expect("index should build");
    fs::remove_file(&file).expect("file should be removed");

    let mut pending = PendingBatch::new(known_entries);
    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Remove(RemoveKind::File),
            std::slice::from_ref(&file),
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::PathState {
            rel_path: "a.md".to_string(),
            before: VaultEntryState::File,
            after: VaultEntryState::Missing,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn untrusted_entry_index_delete_becomes_full_rescan() {
    let root = temp_vault_dir();
    let file = root.join("a.md");
    write_file(&file);
    fs::remove_file(&file).expect("file should be removed");

    let mut pending = PendingBatch::with_trusted_entry_index(Default::default(), false);
    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Remove(RemoveKind::File),
            std::slice::from_ref(&file),
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::FullRescan {
            reason: VaultWatchReason::WatcherError,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn full_rescan_rebuild_failure_clears_trusted_entry_index() {
    let root = temp_vault_dir();
    let file = root.join("a.md");
    write_file(&file);

    let mut pending = PendingBatch::new(collect_entry_index(&root).expect("index should build"));
    pending.mark_full_rescan(VaultWatchReason::WatcherError);
    fs::remove_dir_all(&root).expect("temp vault should be removed");

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::FullRescan {
            reason: VaultWatchReason::WatcherError,
        }]
    );
    assert!(!pending.is_trusted_entry_index());
    assert_eq!(pending.known_entry_count(), 0);
}

#[test]
fn successful_full_rescan_rebuild_restores_trusted_incremental_delete() {
    let root = temp_vault_dir();
    let file = root.join("a.md");
    write_file(&file);

    let mut pending = PendingBatch::with_trusted_entry_index(Default::default(), false);
    pending.mark_full_rescan(VaultWatchReason::BootstrapFailure);

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::FullRescan {
            reason: VaultWatchReason::BootstrapFailure,
        }]
    );
    assert!(pending.is_trusted_entry_index());
    assert_eq!(
        pending.known_entry_state("a.md"),
        Some(VaultEntryState::File)
    );

    fs::remove_file(&file).expect("file should be removed");
    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Remove(RemoveKind::File),
            std::slice::from_ref(&file),
        )],
    );

    let delete_batch = pending
        .take_batch(&root, "stream-1", 2, 100)
        .expect("delete batch should exist");
    assert_eq!(
        delete_batch.ops,
        vec![VaultWatchOp::PathState {
            rel_path: "a.md".to_string(),
            before: VaultEntryState::File,
            after: VaultEntryState::Missing,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn directory_create_emits_path_state_and_scan_tree() {
    let root = temp_vault_dir();
    let dir = root.join("docs");
    let child = dir.join("note.md");
    write_file(&child);

    let mut pending = PendingBatch::new(Default::default());
    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Create(CreateKind::Folder),
            std::slice::from_ref(&dir),
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![
            VaultWatchOp::PathState {
                rel_path: "docs".to_string(),
                before: VaultEntryState::Missing,
                after: VaultEntryState::Directory,
            },
            VaultWatchOp::ScanTree {
                rel_prefix: "docs".to_string(),
                reason: VaultWatchReason::DirectoryCreate,
            },
        ]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn create_and_modify_for_same_file_emit_single_path_state() {
    let root = temp_vault_dir();
    let file = root.join("a.md");
    write_file(&file);

    let mut pending = PendingBatch::new(Default::default());
    pending.apply_debounced_events(
        &root,
        &[
            debounced_event(
                EventKind::Create(CreateKind::File),
                std::slice::from_ref(&file),
            ),
            debounced_event(
                EventKind::Modify(ModifyKind::Data(DataChange::Content)),
                std::slice::from_ref(&file),
            ),
        ],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::PathState {
            rel_path: "a.md".to_string(),
            before: VaultEntryState::Missing,
            after: VaultEntryState::File,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn hidden_file_events_are_ignored() {
    let root = temp_vault_dir();
    let hidden_dir = root.join(".obsidian");
    let hidden_file = hidden_dir.join("workspace.json");
    fs::create_dir_all(&hidden_dir).expect("hidden dir should be created");
    write_file(&hidden_file);

    let mut pending = PendingBatch::new(Default::default());
    pending.apply_debounced_events(
        &root,
        &[
            debounced_event(
                EventKind::Create(CreateKind::File),
                std::slice::from_ref(&hidden_file),
            ),
            debounced_event(
                EventKind::Modify(ModifyKind::Data(DataChange::Content)),
                std::slice::from_ref(&hidden_file),
            ),
        ],
    );

    assert!(pending.take_batch(&root, "stream-1", 1, 100).is_none());

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn visible_file_move_to_hidden_emits_delete() {
    let root = temp_vault_dir();
    let from = root.join("note.md");
    let to = root.join(".obsidian/note.md");
    write_file(&to);

    let mut known_entries = HashMap::new();
    known_entries.insert("note.md".to_string(), VaultEntryState::File);
    let mut pending = PendingBatch::new(known_entries);

    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from, to],
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::PathState {
            rel_path: "note.md".to_string(),
            before: VaultEntryState::File,
            after: VaultEntryState::Missing,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn hidden_file_move_to_visible_emits_create() {
    let root = temp_vault_dir();
    let from = root.join(".obsidian/note.md");
    let to = root.join("note.md");
    write_file(&to);

    let mut pending = PendingBatch::new(Default::default());
    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from, to],
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::PathState {
            rel_path: "note.md".to_string(),
            before: VaultEntryState::Missing,
            after: VaultEntryState::File,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn hidden_directory_move_to_visible_emits_create_and_scan_tree() {
    let root = temp_vault_dir();
    let from = root.join(".obsidian/docs");
    let to = root.join("docs");
    fs::create_dir_all(&to).expect("target dir should be created");
    write_file(&to.join("note.md"));

    let mut pending = PendingBatch::new(Default::default());
    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from, to],
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![
            VaultWatchOp::PathState {
                rel_path: "docs".to_string(),
                before: VaultEntryState::Missing,
                after: VaultEntryState::Directory,
            },
            VaultWatchOp::ScanTree {
                rel_prefix: "docs".to_string(),
                reason: VaultWatchReason::DirectoryMoveIn,
            },
        ]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn debounced_file_move_emits_move() {
    let root = temp_vault_dir();
    let from = root.join("old.md");
    let to = root.join("new.md");
    write_file(&to);

    let mut known_entries = HashMap::new();
    known_entries.insert("old.md".to_string(), VaultEntryState::File);
    let mut pending = PendingBatch::new(known_entries);

    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from, to],
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::Move {
            from_rel: "old.md".to_string(),
            to_rel: "new.md".to_string(),
            entry_kind: VaultEntryKind::File,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn rename_both_with_hidden_extra_path_emits_incremental_move() {
    let root = temp_vault_dir();
    let from = root.join("old.md");
    let to = root.join("new.md");
    let hidden_extra = root.join(".obsidian/workspace.json");
    write_file(&to);
    write_file(&hidden_extra);

    let mut known_entries = HashMap::new();
    known_entries.insert("old.md".to_string(), VaultEntryState::File);
    let mut pending = PendingBatch::new(known_entries);

    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from, to, hidden_extra],
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::Move {
            from_rel: "old.md".to_string(),
            to_rel: "new.md".to_string(),
            entry_kind: VaultEntryKind::File,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn rename_both_with_visible_extra_file_emits_move_and_touch() {
    let root = temp_vault_dir();
    let from = root.join("old.md");
    let to = root.join("new.md");
    let extra = root.join("z.md");
    write_file(&to);
    write_file(&extra);

    let mut known_entries = HashMap::new();
    known_entries.insert("old.md".to_string(), VaultEntryState::File);
    known_entries.insert("z.md".to_string(), VaultEntryState::File);
    let mut pending = PendingBatch::new(known_entries);

    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from, to, extra],
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![
            VaultWatchOp::PathState {
                rel_path: "z.md".to_string(),
                before: VaultEntryState::File,
                after: VaultEntryState::File,
            },
            VaultWatchOp::Move {
                from_rel: "old.md".to_string(),
                to_rel: "new.md".to_string(),
                entry_kind: VaultEntryKind::File,
            },
        ]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn file_move_deleted_before_flush_emits_terminal_delete() {
    let root = temp_vault_dir();
    let from = root.join("old.md");
    let to = root.join("new.md");
    write_file(&to);

    let mut known_entries = HashMap::new();
    known_entries.insert("old.md".to_string(), VaultEntryState::File);
    let mut pending = PendingBatch::new(known_entries);

    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from.clone(), to.clone()],
        )],
    );
    fs::remove_file(&to).expect("destination file should be removed before flush");

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::PathState {
            rel_path: "old.md".to_string(),
            before: VaultEntryState::File,
            after: VaultEntryState::Missing,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn file_move_with_source_recreated_before_flush_emits_path_states() {
    let root = temp_vault_dir();
    let from = root.join("old.md");
    let to = root.join("new.md");
    write_file(&to);

    let mut known_entries = HashMap::new();
    known_entries.insert("old.md".to_string(), VaultEntryState::File);
    let mut pending = PendingBatch::new(known_entries);

    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from.clone(), to.clone()],
        )],
    );
    write_file(&from);

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![
            VaultWatchOp::PathState {
                rel_path: "new.md".to_string(),
                before: VaultEntryState::Missing,
                after: VaultEntryState::File,
            },
            VaultWatchOp::PathState {
                rel_path: "old.md".to_string(),
                before: VaultEntryState::File,
                after: VaultEntryState::File,
            },
        ]
    );

    let _ = fs::remove_dir_all(&root);
}

#[cfg(unix)]
#[test]
fn symlink_create_event_is_ignored() {
    let root = temp_vault_dir();
    let target = root.join("target.md");
    let symlink_path = root.join("link.md");
    write_file(&target);
    std::os::unix::fs::symlink(&target, &symlink_path).expect("symlink should be created");

    let mut pending = PendingBatch::new(Default::default());
    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Create(CreateKind::Any),
            std::slice::from_ref(&symlink_path),
        )],
    );

    assert!(pending.take_batch(&root, "stream-1", 1, 100).is_none());

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn debounced_directory_move_emits_move_and_scan_tree() {
    let root = temp_vault_dir();
    let from = root.join("docs");
    let to = root.join("archive");
    fs::create_dir_all(&to).expect("target dir should be created");

    let mut known_entries = HashMap::new();
    known_entries.insert("docs".to_string(), VaultEntryState::Directory);
    known_entries.insert("docs/note.md".to_string(), VaultEntryState::File);
    let mut pending = PendingBatch::new(known_entries);

    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from, to],
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![
            VaultWatchOp::Move {
                from_rel: "docs".to_string(),
                to_rel: "archive".to_string(),
                entry_kind: VaultEntryKind::Directory,
            },
            VaultWatchOp::ScanTree {
                rel_prefix: "archive".to_string(),
                reason: VaultWatchReason::DirectoryMoveWithin,
            },
        ]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn directory_move_deleted_before_flush_emits_terminal_delete() {
    let root = temp_vault_dir();
    let from = root.join("docs");
    let to = root.join("archive");
    fs::create_dir_all(&to).expect("target dir should be created");
    write_file(&to.join("note.md"));

    let mut known_entries = HashMap::new();
    known_entries.insert("docs".to_string(), VaultEntryState::Directory);
    known_entries.insert("docs/note.md".to_string(), VaultEntryState::File);
    let mut pending = PendingBatch::new(known_entries);

    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from.clone(), to.clone()],
        )],
    );
    fs::remove_dir_all(&to).expect("destination directory should be removed before flush");

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::PathState {
            rel_path: "docs".to_string(),
            before: VaultEntryState::Directory,
            after: VaultEntryState::Missing,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn directory_move_with_source_recreated_before_flush_emits_path_states() {
    let root = temp_vault_dir();
    let from = root.join("docs");
    let to = root.join("archive");
    fs::create_dir_all(&to).expect("target dir should be created");
    write_file(&to.join("note.md"));

    let mut known_entries = HashMap::new();
    known_entries.insert("docs".to_string(), VaultEntryState::Directory);
    known_entries.insert("docs/note.md".to_string(), VaultEntryState::File);
    let mut pending = PendingBatch::new(known_entries);

    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from.clone(), to.clone()],
        )],
    );
    fs::create_dir_all(&from).expect("source directory should be recreated before flush");

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![
            VaultWatchOp::PathState {
                rel_path: "archive".to_string(),
                before: VaultEntryState::Missing,
                after: VaultEntryState::Directory,
            },
            VaultWatchOp::PathState {
                rel_path: "docs".to_string(),
                before: VaultEntryState::Directory,
                after: VaultEntryState::Directory,
            },
            VaultWatchOp::ScanTree {
                rel_prefix: "archive".to_string(),
                reason: VaultWatchReason::DirectoryMoveWithin,
            },
        ]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn split_rename_from_and_to_emits_move() {
    let root = temp_vault_dir();
    let from = root.join("old.md");
    let to = root.join("new.md");
    write_file(&to);

    let mut known_entries = HashMap::new();
    known_entries.insert("old.md".to_string(), VaultEntryState::File);
    let mut pending = PendingBatch::new(known_entries);
    let start = Instant::now();

    pending.apply_debounced_events(
        &root,
        &[
            debounced_event_at(
                EventKind::Modify(ModifyKind::Name(RenameMode::From)),
                std::slice::from_ref(&from),
                start,
            ),
            debounced_event_at(
                EventKind::Modify(ModifyKind::Name(RenameMode::To)),
                std::slice::from_ref(&to),
                start + Duration::from_millis(10),
            ),
        ],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::Move {
            from_rel: "old.md".to_string(),
            to_rel: "new.md".to_string(),
            entry_kind: VaultEntryKind::File,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn split_directory_rename_from_and_to_emits_move_and_scan_tree() {
    let root = temp_vault_dir();
    let from = root.join("docs");
    let to = root.join("archive");
    fs::create_dir_all(&to).expect("target dir should be created");
    write_file(&to.join("note.md"));

    let mut known_entries = HashMap::new();
    known_entries.insert("docs".to_string(), VaultEntryState::Directory);
    known_entries.insert("docs/note.md".to_string(), VaultEntryState::File);
    let mut pending = PendingBatch::new(known_entries);
    let start = Instant::now();

    pending.apply_debounced_events(
        &root,
        &[
            debounced_event_at(
                EventKind::Modify(ModifyKind::Name(RenameMode::From)),
                std::slice::from_ref(&from),
                start,
            ),
            debounced_event_at(
                EventKind::Modify(ModifyKind::Name(RenameMode::To)),
                std::slice::from_ref(&to),
                start + Duration::from_millis(10),
            ),
        ],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![
            VaultWatchOp::Move {
                from_rel: "docs".to_string(),
                to_rel: "archive".to_string(),
                entry_kind: VaultEntryKind::Directory,
            },
            VaultWatchOp::ScanTree {
                rel_prefix: "archive".to_string(),
                reason: VaultWatchReason::DirectoryMoveWithin,
            },
        ]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn split_rename_multiple_candidates_emit_moves_in_fifo_order() {
    let root = temp_vault_dir();
    let from_a = root.join("a.md");
    let from_b = root.join("b.md");
    let to_a = root.join("a2.md");
    let to_b = root.join("b2.md");
    write_file(&to_a);
    write_file(&to_b);

    let mut known_entries = HashMap::new();
    known_entries.insert("a.md".to_string(), VaultEntryState::File);
    known_entries.insert("b.md".to_string(), VaultEntryState::File);
    let mut pending = PendingBatch::new(known_entries);
    let start = Instant::now();

    pending.apply_debounced_events(
        &root,
        &[
            debounced_event_at(
                EventKind::Modify(ModifyKind::Name(RenameMode::From)),
                std::slice::from_ref(&from_a),
                start,
            ),
            debounced_event_at(
                EventKind::Modify(ModifyKind::Name(RenameMode::From)),
                std::slice::from_ref(&from_b),
                start + Duration::from_millis(1),
            ),
            debounced_event_at(
                EventKind::Modify(ModifyKind::Name(RenameMode::To)),
                std::slice::from_ref(&to_a),
                start + Duration::from_millis(2),
            ),
            debounced_event_at(
                EventKind::Modify(ModifyKind::Name(RenameMode::To)),
                std::slice::from_ref(&to_b),
                start + Duration::from_millis(3),
            ),
        ],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![
            VaultWatchOp::Move {
                from_rel: "a.md".to_string(),
                to_rel: "a2.md".to_string(),
                entry_kind: VaultEntryKind::File,
            },
            VaultWatchOp::Move {
                from_rel: "b.md".to_string(),
                to_rel: "b2.md".to_string(),
                entry_kind: VaultEntryKind::File,
            },
        ]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn rename_from_without_target_emits_delete_after_pair_window_expires() {
    let root = temp_vault_dir();
    let file = root.join("a.md");
    write_file(&file);
    let known_entries = collect_entry_index(&root).expect("index should build");
    fs::remove_file(&file).expect("file should be removed");

    let mut pending = PendingBatch::new(known_entries);
    let start = Instant::now();
    pending.apply_debounced_events(
        &root,
        &[debounced_event_at(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            std::slice::from_ref(&file),
            start,
        )],
    );
    pending.expire_pending_renames(
        &root,
        start + Duration::from_millis(1001),
        Duration::from_millis(1000),
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::PathState {
            rel_path: "a.md".to_string(),
            before: VaultEntryState::File,
            after: VaultEntryState::Missing,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn rename_any_with_multiple_paths_force_ambiguous_rescan() {
    let root = temp_vault_dir();
    let from_a = root.join("a.md");
    let from_b = root.join("b.md");
    write_file(&from_a);
    write_file(&from_b);

    let known_entries = collect_entry_index(&root).expect("index should build");
    let mut pending = PendingBatch::new(known_entries);

    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
            &[from_a, from_b],
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::FullRescan {
            reason: VaultWatchReason::AmbiguousRename,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn rename_any_without_target_emits_delete() {
    let root = temp_vault_dir();
    let file = root.join("a.md");
    write_file(&file);
    let known_entries = collect_entry_index(&root).expect("index should build");
    fs::remove_file(&file).expect("file should be removed");

    let mut pending = PendingBatch::new(known_entries);
    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
            std::slice::from_ref(&file),
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::PathState {
            rel_path: "a.md".to_string(),
            before: VaultEntryState::File,
            after: VaultEntryState::Missing,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn rename_to_without_source_emits_create() {
    let root = temp_vault_dir();
    let file = root.join("a.md");
    write_file(&file);

    let mut pending = PendingBatch::new(Default::default());
    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            std::slice::from_ref(&file),
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::PathState {
            rel_path: "a.md".to_string(),
            before: VaultEntryState::Missing,
            after: VaultEntryState::File,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn rename_any_without_source_emits_create() {
    let root = temp_vault_dir();
    let file = root.join("a.md");
    write_file(&file);

    let mut pending = PendingBatch::new(Default::default());
    pending.apply_debounced_events(
        &root,
        &[debounced_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
            std::slice::from_ref(&file),
        )],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 100)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::PathState {
            rel_path: "a.md".to_string(),
            before: VaultEntryState::Missing,
            after: VaultEntryState::File,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn max_batch_paths_overflow_becomes_full_rescan() {
    let root = temp_vault_dir();
    let file_a = root.join("a.md");
    let file_b = root.join("b.md");
    write_file(&file_a);
    write_file(&file_b);

    let mut pending = PendingBatch::new(Default::default());
    pending.apply_debounced_events(
        &root,
        &[
            debounced_event(
                EventKind::Create(CreateKind::File),
                std::slice::from_ref(&file_a),
            ),
            debounced_event(
                EventKind::Create(CreateKind::File),
                std::slice::from_ref(&file_b),
            ),
        ],
    );

    let batch = pending
        .take_batch(&root, "stream-1", 1, 1)
        .expect("batch should exist");
    assert_eq!(
        batch.ops,
        vec![VaultWatchOp::FullRescan {
            reason: VaultWatchReason::WatcherOverflow,
        }]
    );

    let _ = fs::remove_dir_all(&root);
}
