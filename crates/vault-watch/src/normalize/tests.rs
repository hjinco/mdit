use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use notify::event::{CreateKind, DataChange, EventAttributes, ModifyKind, RemoveKind, RenameMode};
use notify::{Event, EventKind};

use super::PendingBatch;
use crate::path::to_vault_rel_path;
use crate::types::{VaultChange, VaultEntryKind};

fn event(kind: EventKind, paths: &[PathBuf]) -> Event {
    Event {
        kind,
        paths: paths.to_vec(),
        attrs: EventAttributes::new(),
    }
}

fn temp_vault_dir() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time should move forward")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("vault-watch-normalize-test-{nanos}"));
    std::fs::create_dir_all(&path).expect("temp vault should be created");
    path
}

fn collect_known_dirs(root: &Path) -> BTreeSet<String> {
    let mut dirs = BTreeSet::new();
    let mut stack = vec![root.to_path_buf()];

    while let Some(dir_path) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir_path) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !file_type.is_dir() {
                continue;
            }
            let path = entry.path();
            if let Some(rel_path) = to_vault_rel_path(root, &path) {
                dirs.insert(rel_path);
            }
            stack.push(path);
        }
    }

    dirs
}

fn pending_for_root(root: &Path) -> PendingBatch {
    PendingBatch::new(collect_known_dirs(root))
}

fn ensure_parent(path: &Path) {
    let parent = path.parent().expect("path should have a parent");
    std::fs::create_dir_all(parent).expect("parent directory should be created");
}

fn write_file(path: &Path) {
    ensure_parent(path);
    std::fs::write(path, "content").expect("file should be written");
}

#[test]
fn maps_create_modify_remove_to_expected_changes() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let created = root.join("a.md");
    let modified = root.join("b.md");
    let removed = root.join("c.md");

    write_file(&created);
    write_file(&modified);
    write_file(&removed);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Create(CreateKind::File),
            std::slice::from_ref(&created),
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Data(DataChange::Content)),
            std::slice::from_ref(&modified),
        ),
        now,
        rename_window,
    );
    std::fs::remove_file(&removed).expect("file should be removed");
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Remove(RemoveKind::File),
            std::slice::from_ref(&removed),
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert!(!batch.rescan);
    assert_eq!(
        batch.changes,
        vec![
            VaultChange::Created {
                rel_path: "a.md".to_string(),
                entry_kind: VaultEntryKind::File
            },
            VaultChange::Modified {
                rel_path: "b.md".to_string(),
                entry_kind: VaultEntryKind::File
            },
            VaultChange::Deleted {
                rel_path: "c.md".to_string(),
                entry_kind: VaultEntryKind::File
            }
        ]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn create_and_delete_same_file_becomes_modified() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let file = root.join("a.md");
    write_file(&file);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Create(CreateKind::File),
            std::slice::from_ref(&file),
        ),
        now,
        rename_window,
    );
    std::fs::remove_file(&file).expect("file should be removed");
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Remove(RemoveKind::File),
            std::slice::from_ref(&file),
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(2, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Modified {
            rel_path: "a.md".to_string(),
            entry_kind: VaultEntryKind::File
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn rename_file_inside_vault_emits_moved_file() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let from = root.join("old.md");
    let to = root.join("new.md");
    write_file(&to);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from, to],
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(3, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Moved {
            from_rel: "old.md".to_string(),
            to_rel: "new.md".to_string(),
            entry_kind: VaultEntryKind::File
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn rename_file_to_outside_vault_emits_deleted_file() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let from = root.join("old.md");
    let outside = root
        .parent()
        .expect("temp dir should have parent")
        .join("outside-old.md");
    write_file(&from);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            std::slice::from_ref(&from),
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            &[outside],
        ),
        now + Duration::from_millis(50),
        rename_window,
    );

    let batch = pending.take_batch(4, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Deleted {
            rel_path: "old.md".to_string(),
            entry_kind: VaultEntryKind::File
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn rename_file_from_outside_vault_emits_created_file() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let outside = root
        .parent()
        .expect("temp dir should have parent")
        .join("outside-new.md");
    let to = root.join("new.md");
    write_file(&to);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[outside, to],
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(5, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Created {
            rel_path: "new.md".to_string(),
            entry_kind: VaultEntryKind::File
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn directory_create_delete_and_move_are_typed_as_directory() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let created = root.join("new-dir");
    std::fs::create_dir_all(&created).expect("dir should be created");
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Create(CreateKind::Folder),
            std::slice::from_ref(&created),
        ),
        now,
        rename_window,
    );

    let moved_from = root.join("docs");
    let moved_to = root.join("archive");
    std::fs::create_dir_all(&moved_to).expect("moved target should exist");
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[moved_from.clone(), moved_to],
        ),
        now,
        rename_window,
    );

    std::fs::remove_dir_all(&created).expect("dir should be removed");
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Remove(RemoveKind::Folder),
            std::slice::from_ref(&created),
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(6, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![
            VaultChange::Created {
                rel_path: "new-dir".to_string(),
                entry_kind: VaultEntryKind::Directory
            },
            VaultChange::Deleted {
                rel_path: "new-dir".to_string(),
                entry_kind: VaultEntryKind::Directory
            },
            VaultChange::Moved {
                from_rel: "docs".to_string(),
                to_rel: "archive".to_string(),
                entry_kind: VaultEntryKind::Directory
            }
        ]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn directory_move_outside_vault_emits_deleted_directory() {
    let root = temp_vault_dir();
    let docs = root.join("docs");
    std::fs::create_dir_all(&docs).expect("docs dir should be created");
    let mut pending = pending_for_root(&root);

    let now = Instant::now();
    let rename_window = Duration::from_secs(1);
    let outside = root
        .parent()
        .expect("temp dir should have parent")
        .join("outside-docs");

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[docs, outside],
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(7, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Deleted {
            rel_path: "docs".to_string(),
            entry_kind: VaultEntryKind::Directory
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn directory_move_into_vault_emits_created_directory() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let outside = root
        .parent()
        .expect("temp dir should have parent")
        .join("outside-created-dir");
    let inside = root.join("incoming");
    std::fs::create_dir_all(&inside).expect("incoming dir should be created");

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[outside, inside],
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(8, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Created {
            rel_path: "incoming".to_string(),
            entry_kind: VaultEntryKind::Directory
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn unknown_boundary_move_kind_triggers_rescan_with_empty_details() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let unknown_inside = root.join("ghost");
    let outside = root
        .parent()
        .expect("temp dir should have parent")
        .join("outside-ghost");

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            std::slice::from_ref(&unknown_inside),
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            &[outside],
        ),
        now + Duration::from_millis(20),
        rename_window,
    );

    let batch = pending.take_batch(9, 100).expect("batch should exist");
    assert!(batch.rescan);
    assert!(batch.changes.is_empty());

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn unknown_boundary_move_into_vault_triggers_rescan_with_empty_details() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let outside = root
        .parent()
        .expect("temp dir should have parent")
        .join("outside-ghost-in");
    let inside = root.join("ghost-in");

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[outside, inside],
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(10, 100).expect("batch should exist");
    assert!(batch.rescan);
    assert!(batch.changes.is_empty());

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn overflow_rescan_clears_detailed_changes() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let a = root.join("a.md");
    let b = root.join("b.md");
    write_file(&a);
    write_file(&b);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Create(CreateKind::File),
            std::slice::from_ref(&a),
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Create(CreateKind::File),
            std::slice::from_ref(&b),
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(11, 1).expect("batch should exist");
    assert!(batch.rescan);
    assert!(batch.changes.is_empty());

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn directory_deleted_drops_descendant_file_changes() {
    let root = temp_vault_dir();
    let docs = root.join("docs");
    std::fs::create_dir_all(&docs).expect("docs should be created");
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let file = docs.join("note.md");
    write_file(&file);
    std::fs::remove_file(&file).expect("file should be removed");
    std::fs::remove_dir_all(&docs).expect("docs should be removed");

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Remove(RemoveKind::Folder),
            std::slice::from_ref(&docs),
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Remove(RemoveKind::File),
            std::slice::from_ref(&file),
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(12, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Deleted {
            rel_path: "docs".to_string(),
            entry_kind: VaultEntryKind::Directory
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn directory_move_drops_descendant_file_moves() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let dir_from = root.join("docs");
    let dir_to = root.join("archive");
    let file_to = dir_to.join("note.md");
    write_file(&file_to);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[dir_from.clone(), dir_to.clone()],
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[dir_from.join("note.md"), file_to],
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(13, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Moved {
            from_rel: "docs".to_string(),
            to_rel: "archive".to_string(),
            entry_kind: VaultEntryKind::Directory
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}
