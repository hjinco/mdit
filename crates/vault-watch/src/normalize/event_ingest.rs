use std::{
    path::Path,
    time::{Duration, Instant},
};

use notify::event::{CreateKind, ModifyKind, RemoveKind, RenameMode};
use notify::EventKind;

use crate::{path::to_vault_rel_path, types::VaultEntryKind};

use super::{PendingBatch, RenameFromCandidate};

impl PendingBatch {
    pub(crate) fn apply_notify_event(
        &mut self,
        vault_root: &Path,
        event: &notify::Event,
        now: Instant,
        rename_window: Duration,
    ) {
        match event.kind {
            EventKind::Access(_) => {
                // Access events are usually noisy and not useful for sync/indexing.
            }
            EventKind::Create(create_kind) => {
                self.handle_create_event(vault_root, event, create_kind);
            }
            EventKind::Modify(ModifyKind::Data(_)) | EventKind::Modify(ModifyKind::Metadata(_)) => {
                self.handle_modified_event(vault_root, event);
            }
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
                self.handle_rename_both_event(vault_root, event);
            }
            EventKind::Modify(ModifyKind::Name(RenameMode::From)) => {
                self.handle_rename_from_event(vault_root, event, now);
            }
            EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
                self.handle_rename_to_event(vault_root, event, now, rename_window);
            }
            EventKind::Modify(ModifyKind::Name(_))
            | EventKind::Modify(ModifyKind::Any)
            | EventKind::Modify(ModifyKind::Other) => {
                self.mark_modified_or_rescan(vault_root, event);
            }
            EventKind::Remove(remove_kind) => {
                self.handle_remove_event(vault_root, event, remove_kind);
            }
            EventKind::Any | EventKind::Other => {
                self.mark_modified_or_rescan(vault_root, event);
            }
        }
    }

    fn handle_create_event(&mut self, vault_root: &Path, event: &notify::Event, kind: CreateKind) {
        for path in &event.paths {
            let Some(rel_path) = to_vault_rel_path(vault_root, path) else {
                continue;
            };

            match kind {
                CreateKind::File => {
                    self.record_created(rel_path, VaultEntryKind::File, vault_root);
                }
                CreateKind::Folder => {
                    self.record_created(rel_path, VaultEntryKind::Directory, vault_root);
                }
                CreateKind::Any | CreateKind::Other => {
                    let inferred = self.infer_entry_kind(vault_root, &rel_path, Some(path));
                    if let Some(entry_kind) = inferred {
                        self.record_created(rel_path, entry_kind, vault_root);
                    } else {
                        self.mark_rescan(false);
                    }
                }
            }
        }
    }

    fn handle_modified_event(&mut self, vault_root: &Path, event: &notify::Event) {
        for path in &event.paths {
            let Some(rel_path) = to_vault_rel_path(vault_root, path) else {
                continue;
            };

            if self.is_directory(rel_path.as_str()) {
                continue;
            }

            if matches!(
                self.infer_entry_kind(vault_root, &rel_path, Some(path)),
                Some(VaultEntryKind::Directory)
            ) {
                continue;
            }

            self.modified_files.insert(rel_path);
        }
    }

    fn handle_remove_event(&mut self, vault_root: &Path, event: &notify::Event, kind: RemoveKind) {
        for path in &event.paths {
            let Some(rel_path) = to_vault_rel_path(vault_root, path) else {
                continue;
            };

            match kind {
                RemoveKind::File => {
                    self.record_deleted(rel_path, VaultEntryKind::File);
                }
                RemoveKind::Folder => {
                    self.record_deleted(rel_path, VaultEntryKind::Directory);
                }
                RemoveKind::Any | RemoveKind::Other => {
                    let entry_kind = if self.is_directory(&rel_path)
                        || self.has_directory_descendant(&rel_path)
                    {
                        Some(VaultEntryKind::Directory)
                    } else {
                        self.infer_entry_kind(vault_root, &rel_path, Some(path))
                    };

                    match entry_kind {
                        Some(kind) => self.record_deleted(rel_path, kind),
                        None => self.record_deleted(rel_path, VaultEntryKind::File),
                    }
                }
            }
        }
    }

    fn mark_modified_or_rescan(&mut self, vault_root: &Path, event: &notify::Event) {
        if event.paths.is_empty() {
            self.mark_rescan(false);
            return;
        }

        for path in &event.paths {
            let Some(rel_path) = to_vault_rel_path(vault_root, path) else {
                continue;
            };

            if self.is_directory(rel_path.as_str()) {
                continue;
            }

            self.modified_files.insert(rel_path);
        }
    }

    fn handle_rename_both_event(&mut self, vault_root: &Path, event: &notify::Event) {
        if event.paths.len() < 2 {
            self.mark_rescan(false);
            return;
        }

        let from_path = &event.paths[0];
        let to_path = &event.paths[1];
        let from_rel = to_vault_rel_path(vault_root, from_path);
        let to_rel = to_vault_rel_path(vault_root, to_path);

        match (from_rel, to_rel) {
            (Some(from), Some(to)) => {
                let inferred_kind = self
                    .infer_entry_kind(vault_root, &from, Some(from_path))
                    .or_else(|| self.infer_entry_kind(vault_root, &to, Some(to_path)));

                if from == to {
                    if !matches!(inferred_kind, Some(VaultEntryKind::Directory)) {
                        self.modified_files.insert(from);
                    }
                } else if let Some(entry_kind) = inferred_kind {
                    self.record_moved(from, to, entry_kind, vault_root);
                } else {
                    self.mark_rescan(true);
                }
            }
            (Some(from), None) => {
                let inferred_kind = self.infer_entry_kind(vault_root, &from, Some(from_path));
                if let Some(entry_kind) = inferred_kind {
                    self.record_deleted(from, entry_kind);
                } else {
                    self.mark_rescan(true);
                }
            }
            (None, Some(to)) => {
                let inferred_kind = self.infer_entry_kind(vault_root, &to, Some(to_path));
                if let Some(entry_kind) = inferred_kind {
                    self.record_created(to, entry_kind, vault_root);
                } else {
                    self.mark_rescan(true);
                }
            }
            (None, None) => {
                self.mark_rescan(false);
            }
        }

        for path in event.paths.iter().skip(2) {
            if let Some(rel_path) = to_vault_rel_path(vault_root, path) {
                if self.is_directory(rel_path.as_str()) {
                    continue;
                }
                self.modified_files.insert(rel_path);
            }
        }
    }

    fn handle_rename_from_event(&mut self, vault_root: &Path, event: &notify::Event, now: Instant) {
        if event.paths.is_empty() {
            self.mark_rescan(false);
            return;
        }

        for path in &event.paths {
            let Some(rel_path) = to_vault_rel_path(vault_root, path) else {
                continue;
            };

            let entry_kind = self.infer_entry_kind(vault_root, &rel_path, Some(path));
            self.rename_from.push_back(RenameFromCandidate {
                rel_path,
                entry_kind,
                seen_at: now,
            });
        }
    }

    fn handle_rename_to_event(
        &mut self,
        vault_root: &Path,
        event: &notify::Event,
        now: Instant,
        rename_window: Duration,
    ) {
        let to_paths = event
            .paths
            .iter()
            .filter_map(|path| to_vault_rel_path(vault_root, path).map(|rel_path| (rel_path, path)))
            .collect::<Vec<_>>();

        if to_paths.is_empty() {
            if let Some(from_candidate) = self.match_rename_from(now, rename_window, vault_root) {
                self.finalize_unmatched_rename_from(vault_root, from_candidate);
            } else {
                self.mark_rescan(false);
            }
            return;
        }

        for (to_rel, to_path) in to_paths {
            if let Some(from_candidate) = self.match_rename_from(now, rename_window, vault_root) {
                let inferred_kind = from_candidate
                    .entry_kind
                    .or_else(|| self.infer_entry_kind(vault_root, &from_candidate.rel_path, None))
                    .or_else(|| self.infer_entry_kind(vault_root, &to_rel, Some(to_path)));

                if from_candidate.rel_path == to_rel {
                    if !matches!(inferred_kind, Some(VaultEntryKind::Directory)) {
                        self.modified_files.insert(to_rel);
                    }
                    continue;
                }

                if let Some(entry_kind) = inferred_kind {
                    self.record_moved(from_candidate.rel_path, to_rel, entry_kind, vault_root);
                } else {
                    self.mark_rescan(true);
                }
            } else {
                let inferred_kind = self.infer_entry_kind(vault_root, &to_rel, Some(to_path));
                if let Some(entry_kind) = inferred_kind {
                    self.record_created(to_rel, entry_kind, vault_root);
                } else {
                    self.mark_rescan(true);
                }
            }
        }
    }

    pub(super) fn finalize_unmatched_rename_from(
        &mut self,
        vault_root: &Path,
        from_candidate: RenameFromCandidate,
    ) {
        let entry_kind = from_candidate
            .entry_kind
            .or_else(|| self.infer_entry_kind(vault_root, &from_candidate.rel_path, None));

        if let Some(entry_kind) = entry_kind {
            self.record_deleted(from_candidate.rel_path, entry_kind);
        } else {
            // Move outside vault with unknown kind should force conservative rescan.
            self.mark_rescan(true);
        }
    }
}
