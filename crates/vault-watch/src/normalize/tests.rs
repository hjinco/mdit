use std::path::Path;
use std::time::{Duration, Instant};

use notify::event::{CreateKind, DataChange, EventAttributes, ModifyKind, RemoveKind, RenameMode};
use notify::{Event, EventKind};

use super::PendingBatch;

fn event(kind: EventKind, paths: &[&str]) -> Event {
    Event {
        kind,
        paths: paths.iter().map(|path| (*path).into()).collect(),
        attrs: EventAttributes::new(),
    }
}

#[test]
fn maps_create_modify_remove_to_expected_buckets() {
    let root = Path::new("/vault");
    let mut pending = PendingBatch::default();
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    pending.apply_notify_event(
        root,
        &event(EventKind::Create(CreateKind::File), &["/vault/a.md"]),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        root,
        &event(
            EventKind::Modify(ModifyKind::Data(DataChange::Content)),
            &["/vault/b.md"],
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        root,
        &event(EventKind::Remove(RemoveKind::File), &["/vault/c.md"]),
        now,
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert_eq!(batch.vault_rel_created, vec!["a.md"]);
    assert_eq!(batch.vault_rel_modified, vec!["b.md"]);
    assert_eq!(batch.vault_rel_removed, vec!["c.md"]);
}

#[test]
fn create_and_remove_same_path_is_promoted_to_modify() {
    let root = Path::new("/vault");
    let mut pending = PendingBatch::default();
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    pending.apply_notify_event(
        root,
        &event(EventKind::Create(CreateKind::File), &["/vault/a.md"]),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        root,
        &event(EventKind::Remove(RemoveKind::File), &["/vault/a.md"]),
        now,
        rename_window,
    );

    let batch = pending.take_batch(1, 100).expect("batch should exist");
    assert!(batch.vault_rel_created.is_empty());
    assert!(batch.vault_rel_removed.is_empty());
    assert_eq!(batch.vault_rel_modified, vec!["a.md"]);
}

#[test]
fn rename_from_to_is_paired_within_window() {
    let root = Path::new("/vault");
    let mut pending = PendingBatch::default();
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    pending.apply_notify_event(
        root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            &["/vault/old.md"],
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            &["/vault/new.md"],
        ),
        now + Duration::from_millis(50),
        rename_window,
    );

    let batch = pending.take_batch(2, 100).expect("batch should exist");
    assert_eq!(batch.vault_rel_renamed.len(), 1);
    assert_eq!(batch.vault_rel_renamed[0].from_rel, "old.md");
    assert_eq!(batch.vault_rel_renamed[0].to_rel, "new.md");
    assert!(batch.vault_rel_created.is_empty());
    assert!(batch.vault_rel_removed.is_empty());
}

#[test]
fn stale_rename_from_falls_back_to_remove() {
    let root = Path::new("/vault");
    let mut pending = PendingBatch::default();
    let now = Instant::now();
    let rename_window = Duration::from_millis(100);

    pending.apply_notify_event(
        root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            &["/vault/old.md"],
        ),
        now,
        rename_window,
    );
    pending.expire_stale_rename_from(now + Duration::from_millis(120), rename_window);

    let batch = pending.take_batch(3, 100).expect("batch should exist");
    assert_eq!(batch.vault_rel_removed, vec!["old.md"]);
    assert!(batch.vault_rel_renamed.is_empty());
}

#[test]
fn rename_to_outside_vault_is_treated_as_remove() {
    let root = Path::new("/vault");
    let mut pending = PendingBatch::default();
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    pending.apply_notify_event(
        root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            &["/vault/old.md"],
        ),
        now,
        rename_window,
    );
    pending.apply_notify_event(
        root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            &["/outside/trash/old.md"],
        ),
        now + Duration::from_millis(50),
        rename_window,
    );

    let batch = pending.take_batch(4, 100).expect("batch should exist");
    assert_eq!(batch.vault_rel_removed, vec!["old.md"]);
    assert!(batch.vault_rel_renamed.is_empty());
    assert!(!batch.rescan);
}

#[test]
fn rename_both_with_to_outside_vault_is_treated_as_remove() {
    let root = Path::new("/vault");
    let mut pending = PendingBatch::default();
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    pending.apply_notify_event(
        root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &["/vault/old.md", "/outside/trash/old.md"],
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(5, 100).expect("batch should exist");
    assert_eq!(batch.vault_rel_removed, vec!["old.md"]);
    assert!(batch.vault_rel_created.is_empty());
    assert!(batch.vault_rel_modified.is_empty());
    assert!(batch.vault_rel_renamed.is_empty());
    assert!(!batch.rescan);
}

#[test]
fn rename_both_with_from_outside_vault_is_treated_as_create() {
    let root = Path::new("/vault");
    let mut pending = PendingBatch::default();
    let now = Instant::now();
    let rename_window = Duration::from_secs(1);

    pending.apply_notify_event(
        root,
        &event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &["/outside/trash/new.md", "/vault/new.md"],
        ),
        now,
        rename_window,
    );

    let batch = pending.take_batch(6, 100).expect("batch should exist");
    assert_eq!(batch.vault_rel_created, vec!["new.md"]);
    assert!(batch.vault_rel_removed.is_empty());
    assert!(batch.vault_rel_modified.is_empty());
    assert!(batch.vault_rel_renamed.is_empty());
    assert!(!batch.rescan);
}

#[test]
fn overflow_rescan_clears_details() {
    let mut pending = PendingBatch::default();
    pending.mark_rescan(true);
    pending.created.insert("a.md".to_string());
    pending.modified.insert("b.md".to_string());

    let batch = pending.take_batch(10, 100).expect("batch should exist");
    assert!(batch.rescan);
    assert!(batch.vault_rel_created.is_empty());
    assert!(batch.vault_rel_modified.is_empty());
    assert!(batch.vault_rel_removed.is_empty());
    assert!(batch.vault_rel_renamed.is_empty());
}
