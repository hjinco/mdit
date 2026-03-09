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

fn event_with_tracker(kind: EventKind, paths: &[PathBuf], tracker: usize) -> Event {
    event(kind, paths).set_tracker(tracker)
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
    PendingBatch::new(collect_known_dirs(root), Vec::new())
}

fn pending_for_root_with_hidden_prefixes(
    root: &Path,
    hidden_boundary_prefixes: Vec<String>,
) -> PendingBatch {
    PendingBatch::new(collect_known_dirs(root), hidden_boundary_prefixes)
}

fn ensure_parent(path: &Path) {
    let parent = path.parent().expect("path should have a parent");
    std::fs::create_dir_all(parent).expect("parent directory should be created");
}

fn write_file(path: &Path) {
    ensure_parent(path);
    std::fs::write(path, "content").expect("file should be written");
}

const HIDDEN_PREFIX: &str = ".mdit";

fn hidden_prefixes() -> Vec<String> {
    vec![HIDDEN_PREFIX.to_string()]
}

fn hidden_path(root: &Path, rel_path: &str) -> PathBuf {
    root.join(format!("{HIDDEN_PREFIX}/{rel_path}"))
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

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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
fn hidden_create_modify_remove_events_are_ignored() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root_with_hidden_prefixes(&root, hidden_prefixes());
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let hidden = hidden_path(&root, "ignored.md");
    write_file(&hidden);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Create(CreateKind::File),
            std::slice::from_ref(&hidden),
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Data(DataChange::Content)),
            std::slice::from_ref(&hidden),
        ),
        now + Duration::from_millis(10),
        rename_window,
    );
    std::fs::remove_file(&hidden).expect("hidden file should be removed");
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Remove(RemoveKind::File),
            std::slice::from_ref(&hidden),
        ),
        now + Duration::from_millis(20),
        rename_window,
    );

    assert!(pending.take_batch(1, 100).is_none());

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn hidden_generic_modify_events_are_ignored() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root_with_hidden_prefixes(&root, hidden_prefixes());
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let hidden = hidden_path(&root, "any.md");
    write_file(&hidden);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Any),
            std::slice::from_ref(&hidden),
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event(EventKind::Any, std::slice::from_ref(&hidden)),
        now + Duration::from_millis(10),
        rename_window,
    );

    assert!(pending.take_batch(1, 100).is_none());

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn dot_prefixed_directory_events_are_ignored_without_explicit_prefixes() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let hidden = root.join(".obsidian/cache.md");
    write_file(&hidden);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Create(CreateKind::File),
            std::slice::from_ref(&hidden),
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Data(DataChange::Content)),
            std::slice::from_ref(&hidden),
        ),
        now + Duration::from_millis(10),
        rename_window,
    );
    std::fs::remove_file(&hidden).expect("hidden file should be removed");
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Remove(RemoveKind::File),
            std::slice::from_ref(&hidden),
        ),
        now + Duration::from_millis(20),
        rename_window,
    );

    assert!(pending.take_batch(1, 100).is_none());

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

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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
fn rename_file_from_visible_to_hidden_emits_deleted_file() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root_with_hidden_prefixes(&root, hidden_prefixes());
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let from = root.join("visible.md");
    let to = hidden_path(&root, "visible.md");
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

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Deleted {
            rel_path: "visible.md".to_string(),
            entry_kind: VaultEntryKind::File
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn rename_file_from_hidden_to_visible_emits_created_file() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root_with_hidden_prefixes(&root, hidden_prefixes());
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let from = hidden_path(&root, "hidden.md");
    let to = root.join("visible.md");
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

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Created {
            rel_path: "visible.md".to_string(),
            entry_kind: VaultEntryKind::File
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn rename_file_inside_hidden_is_ignored() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root_with_hidden_prefixes(&root, hidden_prefixes());
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let from = hidden_path(&root, "a.md");
    let to = hidden_path(&root, "b.md");
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

    assert!(pending.take_batch(1, 100).is_none());

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn rename_both_extra_hidden_paths_are_ignored() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root_with_hidden_prefixes(&root, hidden_prefixes());
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let from = root.join("old.md");
    let to = root.join("new.md");
    let hidden_extra = hidden_path(&root, "ignored.md");
    write_file(&to);
    write_file(&hidden_extra);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from, to, hidden_extra],
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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
fn split_rename_from_visible_to_hidden_emits_deleted_file() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root_with_hidden_prefixes(&root, hidden_prefixes());
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let from = root.join("visible.md");
    let to = hidden_path(&root, "visible.md");
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

    std::fs::remove_file(&from).expect("original file should be removed");
    write_file(&to);
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            std::slice::from_ref(&to),
        ),
        now + Duration::from_millis(20),
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Deleted {
            rel_path: "visible.md".to_string(),
            entry_kind: VaultEntryKind::File
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn split_rename_from_hidden_to_visible_emits_created_file() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root_with_hidden_prefixes(&root, hidden_prefixes());
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let from = hidden_path(&root, "hidden.md");
    let to = root.join("visible.md");
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

    std::fs::remove_file(&from).expect("original hidden file should be removed");
    write_file(&to);
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            std::slice::from_ref(&to),
        ),
        now + Duration::from_millis(20),
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Created {
            rel_path: "visible.md".to_string(),
            entry_kind: VaultEntryKind::File
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn hidden_rename_from_does_not_consume_visible_rename_match() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root_with_hidden_prefixes(&root, hidden_prefixes());
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let hidden_from = hidden_path(&root, "hidden-old.md");
    let visible_from = root.join("visible-old.md");
    let visible_to = root.join("visible-new.md");
    write_file(&hidden_from);
    write_file(&visible_from);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            std::slice::from_ref(&hidden_from),
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            std::slice::from_ref(&visible_from),
        ),
        now + Duration::from_millis(10),
        rename_window,
    );

    std::fs::remove_file(&visible_from).expect("original visible file should be removed");
    write_file(&visible_to);
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            std::slice::from_ref(&visible_to),
        ),
        now + Duration::from_millis(20),
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Moved {
            from_rel: "visible-old.md".to_string(),
            to_rel: "visible-new.md".to_string(),
            entry_kind: VaultEntryKind::File
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn split_rename_matches_interleaved_pairs_by_tracker() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let a_from = root.join("a-old.md");
    let a_to = root.join("a-new.md");
    let b_from = root.join("b-old.md");
    let b_to = root.join("b-new.md");
    write_file(&a_from);
    write_file(&b_from);

    pending.apply_notify_event(
        &root,
        &event_with_tracker(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            std::slice::from_ref(&a_from),
            1,
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event_with_tracker(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            std::slice::from_ref(&b_from),
            2,
        ),
        now + Duration::from_millis(10),
        rename_window,
    );

    std::fs::remove_file(&a_from).expect("first source file should be removed");
    std::fs::remove_file(&b_from).expect("second source file should be removed");
    write_file(&a_to);
    write_file(&b_to);

    pending.apply_notify_event(
        &root,
        &event_with_tracker(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            std::slice::from_ref(&b_to),
            2,
        ),
        now + Duration::from_millis(20),
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event_with_tracker(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            std::slice::from_ref(&a_to),
            1,
        ),
        now + Duration::from_millis(30),
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![
            VaultChange::Moved {
                from_rel: "a-old.md".to_string(),
                to_rel: "a-new.md".to_string(),
                entry_kind: VaultEntryKind::File
            },
            VaultChange::Moved {
                from_rel: "b-old.md".to_string(),
                to_rel: "b-new.md".to_string(),
                entry_kind: VaultEntryKind::File
            }
        ]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn trackerless_split_rename_with_multiple_pending_forces_rescan() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let a_from = root.join("a-old.md");
    let b_from = root.join("b-old.md");
    let b_to = root.join("b-new.md");
    write_file(&a_from);
    write_file(&b_from);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            std::slice::from_ref(&a_from),
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            std::slice::from_ref(&b_from),
        ),
        now + Duration::from_millis(10),
        rename_window,
    );

    std::fs::remove_file(&a_from).expect("first source file should be removed");
    std::fs::remove_file(&b_from).expect("second source file should be removed");
    write_file(&b_to);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            std::slice::from_ref(&b_to),
        ),
        now + Duration::from_millis(20),
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert!(batch.rescan);
    assert!(batch.changes.is_empty());

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn hidden_rename_from_without_match_is_ignored_after_expiry() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root_with_hidden_prefixes(&root, hidden_prefixes());
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let from = hidden_path(&root, "ghost.md");
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

    pending.expire_stale_rename_from(
        &root,
        now + rename_window + Duration::from_millis(1),
        rename_window,
    );
    assert!(pending.take_batch(1, 100).is_none());

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn hidden_rename_to_without_match_is_ignored() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root_with_hidden_prefixes(&root, hidden_prefixes());
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let to = hidden_path(&root, "new.md");
    write_file(&to);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            std::slice::from_ref(&to),
        ),
        now,
        rename_window,
    );

    assert!(pending.take_batch(1, 100).is_none());

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

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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
fn tracked_rename_to_outside_vault_matches_pending_from_by_tracker() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let a_from = root.join("a-old.md");
    let b_from = root.join("b-old.md");
    let a_to = root.join("a-new.md");
    let outside_b = root
        .parent()
        .expect("temp dir should have parent")
        .join("outside-b-old.md");
    write_file(&a_from);
    write_file(&b_from);

    pending.apply_notify_event(
        &root,
        &event_with_tracker(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            std::slice::from_ref(&a_from),
            1,
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event_with_tracker(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            std::slice::from_ref(&b_from),
            2,
        ),
        now + Duration::from_millis(10),
        rename_window,
    );

    std::fs::remove_file(&a_from).expect("first source file should be removed");
    std::fs::remove_file(&b_from).expect("second source file should be removed");
    write_file(&a_to);

    pending.apply_notify_event(
        &root,
        &event_with_tracker(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            std::slice::from_ref(&outside_b),
            2,
        ),
        now + Duration::from_millis(20),
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event_with_tracker(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            std::slice::from_ref(&a_to),
            1,
        ),
        now + Duration::from_millis(30),
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![
            VaultChange::Deleted {
                rel_path: "b-old.md".to_string(),
                entry_kind: VaultEntryKind::File
            },
            VaultChange::Moved {
                from_rel: "a-old.md".to_string(),
                to_rel: "a-new.md".to_string(),
                entry_kind: VaultEntryKind::File
            }
        ]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn rename_mode_any_into_vault_emits_created_file() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let to = root.join("from-outside.md");
    write_file(&to);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
            std::slice::from_ref(&to),
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Created {
            rel_path: "from-outside.md".to_string(),
            entry_kind: VaultEntryKind::File
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn rename_mode_any_to_outside_vault_emits_deleted_file() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let from = root.join("to-outside.md");
    write_file(&from);
    std::fs::remove_file(&from).expect("source file should be removed");

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
            std::slice::from_ref(&from),
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![VaultChange::Deleted {
            rel_path: "to-outside.md".to_string(),
            entry_kind: VaultEntryKind::File
        }]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn rename_mode_any_directory_rename_emits_deleted_old_and_created_new() {
    let root = temp_vault_dir();
    let old_dir = root.join("docs");
    let new_dir = root.join("archive");
    std::fs::create_dir_all(&old_dir).expect("old directory should be created");

    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    std::fs::rename(&old_dir, &new_dir).expect("directory should be renamed");

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
            std::slice::from_ref(&old_dir),
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
            std::slice::from_ref(&new_dir),
        ),
        now + Duration::from_millis(20),
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert_eq!(
        batch.changes,
        vec![
            VaultChange::Created {
                rel_path: "archive".to_string(),
                entry_kind: VaultEntryKind::Directory
            },
            VaultChange::Deleted {
                rel_path: "docs".to_string(),
                entry_kind: VaultEntryKind::Directory
            }
        ]
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn rename_mode_any_with_three_paths_triggers_rescan_with_empty_details() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root(&root);
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let old_path = root.join("old.md");
    let new_path = root.join("new.md");
    let extra_path = root.join("extra.md");
    write_file(&new_path);
    write_file(&extra_path);

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
            &[old_path, new_path, extra_path],
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert!(batch.rescan);
    assert!(batch.changes.is_empty());

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

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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
fn directory_move_from_visible_to_hidden_emits_deleted_directory() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root_with_hidden_prefixes(&root, hidden_prefixes());
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let from = root.join("docs");
    let to = hidden_path(&root, "docs");
    std::fs::create_dir_all(&to).expect("hidden target directory should exist");

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from, to],
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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
fn directory_move_from_hidden_to_visible_emits_created_directory() {
    let root = temp_vault_dir();
    let mut pending = pending_for_root_with_hidden_prefixes(&root, hidden_prefixes());
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    let from = hidden_path(&root, "incoming");
    let to = root.join("incoming");
    std::fs::create_dir_all(&to).expect("visible target directory should exist");

    pending.apply_notify_event(
        &root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[from, to],
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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

    let batch = pending.take_batch(1, 1).expect("batch should exist");
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

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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

    let batch = pending.take_batch(1, 100).expect("batch should exist");
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
