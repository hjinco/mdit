use std::{
    path::Path,
    time::{Duration, Instant},
};

use notify::event::{CreateKind, ModifyKind, RemoveKind, RenameMode};
use notify::EventKind;

use crate::{path::to_vault_rel_path, types::VaultEntryKind};

use super::{PendingBatch, RenameFromCandidate};

enum PathState {
    Present(VaultEntryKind),
    Missing,
    Unknown,
}

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
            EventKind::Modify(ModifyKind::Name(RenameMode::Any))
            | EventKind::Modify(ModifyKind::Name(RenameMode::Other)) => {
                self.handle_rename_unknown_event(vault_root, event);
            }
            EventKind::Modify(ModifyKind::Any) | EventKind::Modify(ModifyKind::Other) => {
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

    fn visible_rel_path(&self, vault_root: &Path, path: &Path) -> Option<String> {
        let rel_path = to_vault_rel_path(vault_root, path)?;
        if self.is_hidden_rel_path(&rel_path) {
            return None;
        }
        Some(rel_path)
    }

    fn handle_create_event(&mut self, vault_root: &Path, event: &notify::Event, kind: CreateKind) {
        for path in &event.paths {
            let Some(rel_path) = self.visible_rel_path(vault_root, path) else {
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
            let Some(rel_path) = self.visible_rel_path(vault_root, path) else {
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
            let Some(rel_path) = self.visible_rel_path(vault_root, path) else {
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
            let Some(rel_path) = self.visible_rel_path(vault_root, path) else {
                continue;
            };

            if self.is_directory(rel_path.as_str()) {
                continue;
            }

            self.modified_files.insert(rel_path);
        }
    }

    fn handle_rename_unknown_event(&mut self, vault_root: &Path, event: &notify::Event) {
        match event.paths.as_slice() {
            [] => {
                self.mark_rescan(false);
            }
            [path] => {
                self.handle_unknown_rename_single_path(vault_root, path);
            }
            [first_path, second_path] => {
                self.handle_unknown_rename_pair(vault_root, first_path, second_path);
            }
            _ => {
                self.mark_rescan(true);
            }
        }
    }

    fn handle_unknown_rename_single_path(&mut self, vault_root: &Path, path: &Path) {
        let Some(rel_path) = self.visible_rel_path(vault_root, path) else {
            return;
        };
        self.record_unknown_rename_boundary_change(vault_root, rel_path, path);
    }

    fn handle_unknown_rename_pair(
        &mut self,
        vault_root: &Path,
        first_path: &Path,
        second_path: &Path,
    ) {
        let first_rel = self.visible_rel_path(vault_root, first_path);
        let second_rel = self.visible_rel_path(vault_root, second_path);

        match (first_rel, second_rel) {
            (Some(first_rel), Some(second_rel)) if first_rel != second_rel => {
                let first_kind = self.infer_entry_kind(vault_root, &first_rel, Some(first_path));
                let second_kind = self.infer_entry_kind(vault_root, &second_rel, Some(second_path));

                match (first_kind, second_kind) {
                    (None, Some(entry_kind)) => {
                        self.record_moved(first_rel, second_rel, entry_kind, vault_root);
                    }
                    (Some(entry_kind), None) => {
                        self.record_moved(second_rel, first_rel, entry_kind, vault_root);
                    }
                    _ => {
                        self.mark_rescan(true);
                    }
                }
            }
            (Some(only_rel), None) => {
                self.record_unknown_rename_boundary_change(vault_root, only_rel, first_path);
            }
            (None, Some(only_rel)) => {
                self.record_unknown_rename_boundary_change(vault_root, only_rel, second_path);
            }
            (Some(_), Some(_)) => {
                self.mark_rescan(true);
            }
            (None, None) => {
                self.mark_rescan(false);
            }
        }
    }

    fn record_unknown_rename_boundary_change(
        &mut self,
        vault_root: &Path,
        rel_path: String,
        path: &Path,
    ) {
        match Self::path_state(path) {
            PathState::Present(entry_kind) => {
                self.record_created(rel_path, entry_kind, vault_root);
            }
            PathState::Missing => {
                let entry_kind =
                    if self.is_directory(&rel_path) || self.has_directory_descendant(&rel_path) {
                        VaultEntryKind::Directory
                    } else {
                        VaultEntryKind::File
                    };
                self.record_deleted(rel_path, entry_kind);
            }
            PathState::Unknown => {
                self.mark_rescan(true);
            }
        }
    }

    fn path_state(path: &Path) -> PathState {
        match std::fs::symlink_metadata(path) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() {
                    PathState::Unknown
                } else if metadata.is_dir() {
                    PathState::Present(VaultEntryKind::Directory)
                } else if metadata.is_file() {
                    PathState::Present(VaultEntryKind::File)
                } else {
                    PathState::Unknown
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => PathState::Missing,
            Err(_) => PathState::Unknown,
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
                    if self.is_hidden_rel_path(&from) {
                        // Hidden-boundary paths are intentionally ignored.
                    } else if !matches!(inferred_kind, Some(VaultEntryKind::Directory)) {
                        self.modified_files.insert(from);
                    }
                } else if let Some(entry_kind) = inferred_kind {
                    self.record_moved(from, to, entry_kind, vault_root);
                } else {
                    self.mark_rescan(true);
                }
            }
            (Some(from), None) => {
                if !self.is_hidden_rel_path(&from) {
                    let inferred_kind = self.infer_entry_kind(vault_root, &from, Some(from_path));
                    if let Some(entry_kind) = inferred_kind {
                        self.record_deleted(from, entry_kind);
                    } else {
                        self.mark_rescan(true);
                    }
                }
            }
            (None, Some(to)) => {
                if !self.is_hidden_rel_path(&to) {
                    let inferred_kind = self.infer_entry_kind(vault_root, &to, Some(to_path));
                    if let Some(entry_kind) = inferred_kind {
                        self.record_created(to, entry_kind, vault_root);
                    } else {
                        self.mark_rescan(true);
                    }
                }
            }
            (None, None) => {
                self.mark_rescan(false);
            }
        }

        for path in event.paths.iter().skip(2) {
            if let Some(rel_path) = to_vault_rel_path(vault_root, path) {
                if self.is_hidden_rel_path(&rel_path) {
                    continue;
                }
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

        let tracker = event.tracker();
        for path in &event.paths {
            let Some(rel_path) = to_vault_rel_path(vault_root, path) else {
                continue;
            };

            if self.is_hidden_rel_path(&rel_path) {
                continue;
            }

            let entry_kind = self.infer_entry_kind(vault_root, &rel_path, Some(path));
            self.rename_from.push_back(RenameFromCandidate {
                rel_path,
                entry_kind,
                tracker,
                seen_at: now,
            });
        }
    }

    fn match_split_rename_from_candidate(
        &mut self,
        now: Instant,
        rename_window: Duration,
        vault_root: &Path,
        tracker: Option<usize>,
    ) -> Option<RenameFromCandidate> {
        if let Some(tracker) = tracker {
            return self.match_rename_from_by_tracker(now, rename_window, vault_root, tracker);
        }

        match self.pending_rename_from_count(now, rename_window, vault_root) {
            0 => None,
            1 => self.match_rename_from(now, rename_window, vault_root),
            _ => {
                self.clear_pending_rename_from();
                self.mark_rescan(true);
                None
            }
        }
    }

    fn handle_rename_to_event(
        &mut self,
        vault_root: &Path,
        event: &notify::Event,
        now: Instant,
        rename_window: Duration,
    ) {
        let tracker = event.tracker();
        let to_paths = event
            .paths
            .iter()
            .filter_map(|path| to_vault_rel_path(vault_root, path).map(|rel_path| (rel_path, path)))
            .collect::<Vec<_>>();

        if to_paths.is_empty() {
            if let Some(from_candidate) =
                self.match_split_rename_from_candidate(now, rename_window, vault_root, tracker)
            {
                self.finalize_unmatched_rename_from(vault_root, from_candidate);
            } else {
                self.mark_rescan(false);
            }
            return;
        }

        for (to_rel, to_path) in to_paths {
            let from_candidate =
                self.match_split_rename_from_candidate(now, rename_window, vault_root, tracker);

            if let Some(from_candidate) = from_candidate {
                let inferred_kind = from_candidate
                    .entry_kind
                    .or_else(|| self.infer_entry_kind(vault_root, &from_candidate.rel_path, None))
                    .or_else(|| self.infer_entry_kind(vault_root, &to_rel, Some(to_path)));

                if from_candidate.rel_path == to_rel {
                    if self.is_hidden_rel_path(&to_rel) {
                        continue;
                    }

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
                if self.is_hidden_rel_path(&to_rel) {
                    continue;
                }

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
        if self.is_hidden_rel_path(&from_candidate.rel_path) {
            return;
        }

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
