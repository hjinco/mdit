use std::{
    collections::{BTreeMap, BTreeSet, HashMap, VecDeque},
    path::Path,
    time::{Duration, Instant},
};

use notify_debouncer_full::DebouncedEvent;

use crate::{
    entry_index::EntryIndex,
    event_projector::{
        is_covered_by_moves, is_covered_by_scan_tree_descendant, EventProjector,
        PendingRenameFromCandidate, ProjectedChanges,
    },
    scan::entry_state_from_path,
    types::{VaultEntryKind, VaultEntryState, VaultWatchBatch, VaultWatchOp, VaultWatchReason},
};

#[derive(Debug)]
pub(crate) struct PendingBatch {
    entry_index: EntryIndex,
    changes: ProjectedChanges,
    pending_rename_from: VecDeque<PendingRenameFromCandidate>,
}

impl PendingBatch {
    #[cfg(test)]
    pub(crate) fn new(known_entries: HashMap<String, VaultEntryState>) -> Self {
        Self::with_trusted_entry_index(known_entries, true)
    }

    pub(crate) fn with_trusted_entry_index(
        known_entries: HashMap<String, VaultEntryState>,
        has_trusted_entry_index: bool,
    ) -> Self {
        Self {
            entry_index: EntryIndex::new(known_entries, has_trusted_entry_index),
            changes: ProjectedChanges::default(),
            pending_rename_from: VecDeque::new(),
        }
    }

    pub(crate) fn mark_full_rescan(&mut self, reason: VaultWatchReason) {
        self.changes.mark_full_rescan(reason);
    }

    pub(crate) fn has_emitable_changes(&self) -> bool {
        self.changes.has_emitable_changes()
    }

    pub(crate) fn apply_debounced_events(&mut self, vault_root: &Path, events: &[DebouncedEvent]) {
        EventProjector::new(
            vault_root,
            &self.entry_index,
            &mut self.changes,
            &mut self.pending_rename_from,
        )
        .apply_debounced_events(events);
    }

    pub(crate) fn expire_pending_renames(
        &mut self,
        vault_root: &Path,
        now: Instant,
        rename_pair_window: Duration,
    ) {
        EventProjector::new(
            vault_root,
            &self.entry_index,
            &mut self.changes,
            &mut self.pending_rename_from,
        )
        .expire_pending_rename_from(now, rename_pair_window.as_millis());
    }

    pub(crate) fn finalize_pending_renames(&mut self, _vault_root: &Path) {
        EventProjector::new(
            _vault_root,
            &self.entry_index,
            &mut self.changes,
            &mut self.pending_rename_from,
        )
        .finalize_pending_rename_from();
    }

    pub(crate) fn take_batch(
        &mut self,
        vault_root: &Path,
        stream_id: &str,
        seq_in_stream: u64,
        max_batch_paths: usize,
    ) -> Option<VaultWatchBatch> {
        if !self.has_emitable_changes() {
            return None;
        }

        if !self.changes.has_full_rescan() && self.changes.event_path_count() > max_batch_paths {
            self.changes
                .mark_full_rescan(VaultWatchReason::WatcherOverflow);
        }

        let mut batch = VaultWatchBatch::empty(stream_id.to_string(), seq_in_stream);
        if let Some(reason) = self.changes.take_full_rescan() {
            batch.ops.push(VaultWatchOp::FullRescan { reason });
            if self.entry_index.rebuild_from_fs(vault_root).is_err() {
                self.entry_index.clear_untrusted();
            }
            self.changes.clear_incremental_state();
            self.pending_rename_from.clear();
            return Some(batch);
        }

        let (moves, invalidated_move_endpoints) =
            partition_retained_moves(vault_root, self.changes.take_moves());
        let mut scan_trees = self.changes.take_scan_trees();
        let mut touched_paths = self.changes.take_touched_paths();
        touched_paths.extend(invalidated_move_endpoints);

        scan_trees.retain(|rel_prefix, _| {
            matches!(
                entry_state_from_fs(vault_root, rel_prefix),
                VaultEntryState::Directory
            )
        });
        let scan_prefixes = scan_trees.keys().cloned().collect::<Vec<_>>();

        let mut path_state_updates = Vec::new();
        for rel_path in touched_paths {
            if is_covered_by_moves(&rel_path, &moves)
                || is_covered_by_scan_tree_descendant(&rel_path, &scan_prefixes)
            {
                continue;
            }

            let before = self.entry_index.get_or_missing(&rel_path);
            let after = entry_state_from_fs(vault_root, &rel_path);
            if should_emit_path_state(before, after) {
                batch.ops.push(VaultWatchOp::PathState {
                    rel_path: rel_path.clone(),
                    before,
                    after,
                });
            }
            path_state_updates.push((rel_path, after));
        }

        for ((from_rel, to_rel), entry_kind) in &moves {
            batch.ops.push(VaultWatchOp::Move {
                from_rel: from_rel.clone(),
                to_rel: to_rel.clone(),
                entry_kind: *entry_kind,
            });
        }

        for (rel_prefix, reason) in &scan_trees {
            batch.ops.push(VaultWatchOp::ScanTree {
                rel_prefix: rel_prefix.clone(),
                reason: *reason,
            });
        }

        self.entry_index.apply_moves(&moves);
        self.entry_index
            .apply_path_state_updates(path_state_updates);
        for rel_prefix in scan_trees.keys() {
            self.entry_index
                .refresh_prefix_from_fs(vault_root, rel_prefix);
        }

        if batch.has_payload() {
            Some(batch)
        } else {
            None
        }
    }
}

fn should_emit_path_state(before: VaultEntryState, after: VaultEntryState) -> bool {
    if before == VaultEntryState::Missing && after == VaultEntryState::Missing {
        return false;
    }

    if before == after {
        return matches!(after, VaultEntryState::File | VaultEntryState::Directory);
    }

    true
}

fn partition_retained_moves(
    vault_root: &Path,
    moves: BTreeMap<(String, String), VaultEntryKind>,
) -> (BTreeMap<(String, String), VaultEntryKind>, BTreeSet<String>) {
    let mut retained_moves = BTreeMap::new();
    let mut invalidated_move_endpoints = BTreeSet::new();

    for ((from_rel, to_rel), entry_kind) in moves {
        if is_pure_move_transition(vault_root, &from_rel, &to_rel, entry_kind) {
            retained_moves.insert((from_rel, to_rel), entry_kind);
            continue;
        }

        invalidated_move_endpoints.insert(from_rel);
        invalidated_move_endpoints.insert(to_rel);
    }

    (retained_moves, invalidated_move_endpoints)
}

fn is_pure_move_transition(
    vault_root: &Path,
    from_rel: &str,
    to_rel: &str,
    entry_kind: VaultEntryKind,
) -> bool {
    let from_state = entry_state_from_fs(vault_root, from_rel);
    let to_state = entry_state_from_fs(vault_root, to_rel);

    from_state == VaultEntryState::Missing
        && to_state
            == match entry_kind {
                VaultEntryKind::File => VaultEntryState::File,
                VaultEntryKind::Directory => VaultEntryState::Directory,
            }
}

fn entry_state_from_fs(vault_root: &Path, rel_path: &str) -> VaultEntryState {
    entry_state_from_path(&vault_root.join(rel_path))
}

#[cfg(test)]
impl PendingBatch {
    pub(crate) fn is_trusted_entry_index(&self) -> bool {
        self.entry_index.is_trusted()
    }

    pub(crate) fn known_entry_state(&self, rel_path: &str) -> Option<VaultEntryState> {
        self.entry_index.get(rel_path).copied()
    }

    pub(crate) fn known_entry_count(&self) -> usize {
        self.entry_index.known_entry_count()
    }
}

#[cfg(test)]
mod tests;
