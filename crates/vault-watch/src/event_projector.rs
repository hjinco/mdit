use std::{
    collections::{BTreeMap, BTreeSet, VecDeque},
    path::Path,
    time::Instant,
};

use notify::event::{CreateKind, ModifyKind, RemoveKind, RenameMode};
use notify::EventKind;
use notify_debouncer_full::DebouncedEvent;

use crate::{
    entry_index::EntryIndex,
    path::{is_hidden_vault_rel_path, to_vault_rel_path},
    scan::entry_state_from_path,
    types::{VaultEntryKind, VaultEntryState, VaultWatchReason},
};

#[derive(Debug, Clone)]
pub(crate) struct PendingRenameFromCandidate {
    pub rel_path: String,
    pub entry_kind: Option<VaultEntryKind>,
    pub seen_at: Instant,
}

#[derive(Debug, Default)]
pub(crate) struct ProjectedChanges {
    touched_paths: BTreeSet<String>,
    moves: BTreeMap<(String, String), VaultEntryKind>,
    scan_trees: BTreeMap<String, VaultWatchReason>,
    full_rescan: Option<VaultWatchReason>,
}

impl ProjectedChanges {
    pub(crate) fn mark_full_rescan(&mut self, reason: VaultWatchReason) {
        if self.full_rescan.is_none() {
            self.full_rescan = Some(reason);
        }
        self.clear_incremental_state();
    }

    fn mark_full_rescan_if_absent(&mut self, reason: VaultWatchReason) {
        if self.full_rescan.is_none() {
            self.mark_full_rescan(reason);
        }
    }

    fn schedule_scan_tree(&mut self, rel_prefix: String, reason: VaultWatchReason) {
        if self.full_rescan.is_some() || is_hidden_vault_rel_path(&rel_prefix) {
            return;
        }
        self.scan_trees.entry(rel_prefix).or_insert(reason);
    }

    fn clear_scan_tree_prefix(&mut self, rel_prefix: &str) {
        self.scan_trees.retain(|candidate, _| {
            candidate != rel_prefix && !is_descendant(candidate, rel_prefix)
        });
    }

    fn touch(&mut self, rel_path: String) {
        if self.full_rescan.is_none() && !is_hidden_vault_rel_path(&rel_path) {
            self.touched_paths.insert(rel_path);
        }
    }

    fn record_move(
        &mut self,
        from_rel: String,
        to_rel: String,
        entry_kind: VaultEntryKind,
        reason: Option<VaultWatchReason>,
    ) {
        if self.full_rescan.is_some() {
            return;
        }

        self.clear_scan_tree_prefix(&from_rel);
        self.moves.insert((from_rel, to_rel.clone()), entry_kind);
        if matches!(entry_kind, VaultEntryKind::Directory) {
            let scan_reason = reason.unwrap_or(VaultWatchReason::DirectoryMoveWithin);
            self.schedule_scan_tree(to_rel, scan_reason);
        }
    }

    pub(crate) fn has_emitable_changes(&self) -> bool {
        self.full_rescan.is_some()
            || !self.touched_paths.is_empty()
            || !self.moves.is_empty()
            || !self.scan_trees.is_empty()
    }

    pub(crate) fn event_path_count(&self) -> usize {
        self.touched_paths.len() + (self.moves.len() * 2) + self.scan_trees.len()
    }

    pub(crate) fn has_full_rescan(&self) -> bool {
        self.full_rescan.is_some()
    }

    pub(crate) fn take_full_rescan(&mut self) -> Option<VaultWatchReason> {
        self.full_rescan.take()
    }

    pub(crate) fn take_touched_paths(&mut self) -> BTreeSet<String> {
        std::mem::take(&mut self.touched_paths)
    }

    pub(crate) fn take_moves(&mut self) -> BTreeMap<(String, String), VaultEntryKind> {
        std::mem::take(&mut self.moves)
    }

    pub(crate) fn take_scan_trees(&mut self) -> BTreeMap<String, VaultWatchReason> {
        std::mem::take(&mut self.scan_trees)
    }

    pub(crate) fn clear_incremental_state(&mut self) {
        self.touched_paths.clear();
        self.moves.clear();
        self.scan_trees.clear();
    }
}

pub(crate) struct EventProjector<'a> {
    vault_root: &'a Path,
    entry_index: &'a EntryIndex,
    changes: &'a mut ProjectedChanges,
    pending_rename_from: &'a mut VecDeque<PendingRenameFromCandidate>,
}

impl<'a> EventProjector<'a> {
    pub(crate) fn new(
        vault_root: &'a Path,
        entry_index: &'a EntryIndex,
        changes: &'a mut ProjectedChanges,
        pending_rename_from: &'a mut VecDeque<PendingRenameFromCandidate>,
    ) -> Self {
        Self {
            vault_root,
            entry_index,
            changes,
            pending_rename_from,
        }
    }

    pub(crate) fn apply_debounced_events(&mut self, events: &[DebouncedEvent]) {
        for event in events {
            self.apply_debounced_event(event);
        }
    }

    fn apply_debounced_event(&mut self, event: &DebouncedEvent) {
        if self.changes.full_rescan.is_some() {
            return;
        }

        if event.event.need_rescan() {
            self.changes
                .mark_full_rescan_if_absent(VaultWatchReason::WatcherOverflow);
            return;
        }

        match event.event.kind {
            EventKind::Access(_) => {}
            EventKind::Create(create_kind) => self.handle_create_event(&event.event, create_kind),
            EventKind::Modify(ModifyKind::Data(_))
            | EventKind::Modify(ModifyKind::Metadata(_))
            | EventKind::Modify(ModifyKind::Any)
            | EventKind::Modify(ModifyKind::Other)
            | EventKind::Any
            | EventKind::Other => self.handle_touch_event(&event.event),
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
                self.handle_rename_both_event(&event.event)
            }
            EventKind::Modify(ModifyKind::Name(RenameMode::Any)) => {
                self.handle_rename_any_event(&event.event)
            }
            EventKind::Modify(ModifyKind::Name(RenameMode::From)) => {
                self.handle_rename_from_event(event)
            }
            EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
                self.handle_rename_to_event(event)
            }
            EventKind::Modify(ModifyKind::Name(_)) => {
                self.changes
                    .mark_full_rescan_if_absent(VaultWatchReason::AmbiguousRename);
            }
            EventKind::Remove(remove_kind) => self.handle_remove_event(&event.event, remove_kind),
        }
    }

    fn handle_create_event(&mut self, event: &notify::Event, kind: CreateKind) {
        for path in &event.paths {
            let Some(rel_path) = to_vault_rel_path(self.vault_root, path) else {
                continue;
            };
            if is_hidden_vault_rel_path(&rel_path) {
                continue;
            }
            self.changes.touch(rel_path.clone());

            let entry_kind = match kind {
                CreateKind::File => Some(VaultEntryKind::File),
                CreateKind::Folder => Some(VaultEntryKind::Directory),
                CreateKind::Any | CreateKind::Other => self
                    .infer_entry_kind(&rel_path, Some(path))
                    .or_else(|| self.entry_index.known_entry_kind(&rel_path)),
            };

            if matches!(entry_kind, Some(VaultEntryKind::Directory)) {
                self.changes
                    .schedule_scan_tree(rel_path, VaultWatchReason::DirectoryCreate);
            }
        }
    }

    fn handle_touch_event(&mut self, event: &notify::Event) {
        if event.paths.is_empty() {
            self.changes
                .mark_full_rescan_if_absent(VaultWatchReason::WatcherError);
            return;
        }

        for path in &event.paths {
            if let Some(rel_path) = to_vault_rel_path(self.vault_root, path) {
                self.changes.touch(rel_path);
            }
        }
    }

    fn handle_remove_event(&mut self, event: &notify::Event, _kind: RemoveKind) {
        if event.paths.is_empty() {
            self.changes
                .mark_full_rescan_if_absent(VaultWatchReason::WatcherError);
            return;
        }

        for path in &event.paths {
            if let Some(rel_path) = to_vault_rel_path(self.vault_root, path) {
                self.record_removal(rel_path);
            }
        }
    }

    fn handle_rename_both_event(&mut self, event: &notify::Event) {
        let visible_paths = event
            .paths
            .iter()
            .enumerate()
            .filter_map(|(index, path)| {
                let rel_path = to_vault_rel_path(self.vault_root, path)?;
                if is_hidden_vault_rel_path(&rel_path) {
                    return None;
                }

                Some((index, rel_path, path.as_path()))
            })
            .collect::<Vec<_>>();

        match visible_paths.as_slice() {
            [] => {}
            [(index, rel_path, path)] => {
                if *index == 0 {
                    self.project_rename_transition(Some((rel_path, None, Some(*path))), None);
                } else {
                    self.project_rename_transition(None, Some((rel_path, *path)));
                }
            }
            _ => {
                let (_, from_rel, from_path) = &visible_paths[0];
                let (_, to_rel, to_path) = &visible_paths[1];
                self.project_rename_transition(
                    Some((from_rel, None, Some(*from_path))),
                    Some((to_rel, *to_path)),
                );

                // Some notify backends attach additional visible paths to the same rename event.
                // Preserve the leading rename pair and degrade trailing file paths to touch events.
                for (_, rel_path, path) in visible_paths.iter().skip(2) {
                    if !matches!(
                        self.infer_entry_kind(rel_path, Some(*path)),
                        Some(VaultEntryKind::Directory)
                    ) {
                        self.changes.touch(rel_path.clone());
                    }
                }
            }
        }
    }

    fn handle_rename_any_event(&mut self, event: &notify::Event) {
        if event.paths.len() != 1 {
            self.changes
                .mark_full_rescan_if_absent(VaultWatchReason::AmbiguousRename);
            return;
        }

        let path = &event.paths[0];
        let Some(rel_path) = to_vault_rel_path(self.vault_root, path) else {
            return;
        };

        let after = entry_state_from_fs(self.vault_root, &rel_path, Some(path));
        match after {
            VaultEntryState::Missing => self.record_removal(rel_path),
            VaultEntryState::Directory => {
                self.changes.touch(rel_path.clone());
                if self.entry_index.get_or_missing(&rel_path) != VaultEntryState::Directory {
                    self.changes
                        .schedule_scan_tree(rel_path, VaultWatchReason::DirectoryMoveIn);
                }
            }
            VaultEntryState::File | VaultEntryState::Unknown => {
                self.changes.touch(rel_path);
            }
        }
    }

    fn handle_rename_from_event(&mut self, event: &DebouncedEvent) {
        if event.event.paths.len() != 1 {
            self.changes
                .mark_full_rescan_if_absent(VaultWatchReason::AmbiguousRename);
            return;
        }

        let from_path = &event.event.paths[0];
        let Some(from_rel) = to_vault_rel_path(self.vault_root, from_path) else {
            return;
        };

        if is_hidden_vault_rel_path(&from_rel) {
            return;
        }

        let entry_kind = self
            .entry_index
            .known_entry_kind(&from_rel)
            .or_else(|| self.infer_entry_kind(&from_rel, Some(from_path)));

        self.pending_rename_from
            .push_back(PendingRenameFromCandidate {
                rel_path: from_rel,
                entry_kind,
                seen_at: event.time,
            });
    }

    fn handle_rename_to_event(&mut self, event: &DebouncedEvent) {
        let event = &event.event;
        let to_paths = event
            .paths
            .iter()
            .filter_map(|path| {
                let rel_path = to_vault_rel_path(self.vault_root, path)?;
                if is_hidden_vault_rel_path(&rel_path) {
                    return None;
                }

                Some((rel_path, path.as_path()))
            })
            .collect::<Vec<_>>();

        if to_paths.is_empty() {
            if let Some(from_candidate) = self.pending_rename_from.pop_front() {
                self.project_rename_transition(
                    Some((&from_candidate.rel_path, from_candidate.entry_kind, None)),
                    None,
                );
            }
            return;
        }

        for (to_rel, to_path) in to_paths {
            if let Some(from_candidate) = self.pending_rename_from.pop_front() {
                self.project_rename_transition(
                    Some((&from_candidate.rel_path, from_candidate.entry_kind, None)),
                    Some((&to_rel, to_path)),
                );
            } else {
                self.project_rename_transition(None, Some((&to_rel, to_path)));
            }
        }
    }

    pub(crate) fn expire_pending_rename_from(&mut self, now: Instant, rename_pair_window_ms: u128) {
        while self.pending_rename_from.front().is_some_and(|candidate| {
            now.checked_duration_since(candidate.seen_at)
                .is_some_and(|elapsed| elapsed.as_millis() >= rename_pair_window_ms)
        }) {
            if let Some(candidate) = self.pending_rename_from.pop_front() {
                self.finalize_unmatched_rename_from(candidate);
            }
        }
    }

    pub(crate) fn finalize_pending_rename_from(&mut self) {
        while let Some(candidate) = self.pending_rename_from.pop_front() {
            self.finalize_unmatched_rename_from(candidate);
        }
    }

    fn record_removal(&mut self, rel_path: String) {
        self.changes.clear_scan_tree_prefix(&rel_path);
        if self.changes.full_rescan.is_some() || is_hidden_vault_rel_path(&rel_path) {
            return;
        }

        if !self.entry_index.is_trusted()
            && !self.entry_index.has_known_entry_or_descendant(&rel_path)
        {
            self.changes
                .mark_full_rescan_if_absent(VaultWatchReason::WatcherError);
            return;
        }

        self.changes.touch(rel_path);
    }

    fn finalize_unmatched_rename_from(&mut self, candidate: PendingRenameFromCandidate) {
        if is_hidden_vault_rel_path(&candidate.rel_path) {
            return;
        }

        if let Some(entry_kind) = candidate
            .entry_kind
            .or_else(|| self.entry_index.known_entry_kind(&candidate.rel_path))
        {
            match entry_kind {
                VaultEntryKind::File | VaultEntryKind::Directory => {
                    self.record_removal(candidate.rel_path);
                }
            }
        } else {
            self.changes
                .mark_full_rescan_if_absent(VaultWatchReason::AmbiguousRename);
        }
    }

    fn project_rename_transition(
        &mut self,
        from: Option<(&str, Option<VaultEntryKind>, Option<&Path>)>,
        to: Option<(&str, &Path)>,
    ) {
        let from_visible = from.is_some_and(|(rel_path, _, _)| !is_hidden_vault_rel_path(rel_path));
        let to_visible = to.is_some_and(|(rel_path, _)| !is_hidden_vault_rel_path(rel_path));

        match (from, to, from_visible, to_visible) {
            (Some((from_rel, _, _)), Some((to_rel, _)), true, true) if from_rel == to_rel => {
                self.changes.touch(from_rel.to_string());
            }
            (Some((from_rel, from_kind, from_path)), Some((to_rel, to_path)), true, true) => {
                let entry_kind = from_kind
                    .or_else(|| self.infer_entry_kind(to_rel, Some(to_path)))
                    .or_else(|| self.entry_index.known_entry_kind(from_rel))
                    .or_else(|| {
                        from_path.and_then(|path| self.infer_entry_kind(from_rel, Some(path)))
                    });

                match entry_kind {
                    Some(entry_kind) => self.changes.record_move(
                        from_rel.to_string(),
                        to_rel.to_string(),
                        entry_kind,
                        Some(VaultWatchReason::DirectoryMoveWithin),
                    ),
                    None => self
                        .changes
                        .mark_full_rescan_if_absent(VaultWatchReason::AmbiguousRename),
                }
            }
            (Some((from_rel, _, _)), _, true, false) => {
                self.record_removal(from_rel.to_string());
            }
            (_, Some((to_rel, to_path)), false, true) => {
                self.changes.touch(to_rel.to_string());
                if matches!(
                    self.infer_entry_kind(to_rel, Some(to_path)),
                    Some(VaultEntryKind::Directory)
                ) {
                    self.changes
                        .schedule_scan_tree(to_rel.to_string(), VaultWatchReason::DirectoryMoveIn);
                }
            }
            _ => {}
        }
    }

    fn infer_entry_kind(&self, rel_path: &str, path_hint: Option<&Path>) -> Option<VaultEntryKind> {
        match entry_state_from_fs(self.vault_root, rel_path, path_hint) {
            VaultEntryState::File => Some(VaultEntryKind::File),
            VaultEntryState::Directory => Some(VaultEntryKind::Directory),
            _ => None,
        }
    }
}

pub(crate) fn is_covered_by_moves(
    rel_path: &str,
    moves: &BTreeMap<(String, String), VaultEntryKind>,
) -> bool {
    moves.iter().any(|((from_rel, to_rel), entry_kind)| {
        rel_path == from_rel
            || rel_path == to_rel
            || matches!(entry_kind, VaultEntryKind::Directory)
                && (is_descendant(rel_path, from_rel) || is_descendant(rel_path, to_rel))
    })
}

pub(crate) fn is_covered_by_scan_tree_descendant(rel_path: &str, scan_prefixes: &[String]) -> bool {
    scan_prefixes
        .iter()
        .any(|prefix| rel_path != prefix && is_descendant(rel_path, prefix))
}

fn is_descendant(path: &str, prefix: &str) -> bool {
    path.strip_prefix(prefix)
        .is_some_and(|suffix| suffix.starts_with('/'))
}

fn entry_state_from_fs(
    vault_root: &Path,
    rel_path: &str,
    path_hint: Option<&Path>,
) -> VaultEntryState {
    let candidate_path = match path_hint {
        Some(path) => path.to_path_buf(),
        None => vault_root.join(rel_path),
    };

    entry_state_from_path(&candidate_path)
}
