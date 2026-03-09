mod dir_index;
mod emit;
mod event_ingest;

use std::{
    collections::{BTreeSet, VecDeque},
    path::Path,
    time::{Duration, Instant},
};

use crate::types::{VaultChangeBatch, VaultEntryKind};

#[derive(Debug, Clone)]
pub(super) struct RenameFromCandidate {
    rel_path: String,
    entry_kind: Option<VaultEntryKind>,
    tracker: Option<usize>,
    seen_at: Instant,
}

#[derive(Debug, Default)]
pub(crate) struct PendingBatch {
    created_files: BTreeSet<String>,
    created_dirs: BTreeSet<String>,
    modified_files: BTreeSet<String>,
    deleted_files: BTreeSet<String>,
    deleted_dirs: BTreeSet<String>,
    moved_files: BTreeSet<(String, String)>,
    moved_dirs: BTreeSet<(String, String)>,
    rename_from: VecDeque<RenameFromCandidate>,
    known_dirs: BTreeSet<String>,
    hidden_boundary_prefixes: Vec<String>,
    rescan: bool,
    clear_details: bool,
}

impl PendingBatch {
    pub(crate) fn new(known_dirs: BTreeSet<String>, hidden_boundary_prefixes: Vec<String>) -> Self {
        Self {
            known_dirs,
            hidden_boundary_prefixes,
            ..Self::default()
        }
    }

    pub(super) fn is_hidden_rel_path(&self, rel_path: &str) -> bool {
        if rel_path
            .split('/')
            .any(|component| component.starts_with('.') && component.len() > 1)
        {
            return true;
        }

        self.hidden_boundary_prefixes.iter().any(|prefix| {
            rel_path == prefix
                || rel_path
                    .strip_prefix(prefix)
                    .is_some_and(|suffix| suffix.starts_with('/'))
        })
    }

    pub(crate) fn mark_rescan(&mut self, clear_details: bool) {
        self.rescan = true;
        self.clear_details |= clear_details;
    }

    pub(crate) fn has_emitable_changes(&self) -> bool {
        self.rescan
            || !self.created_files.is_empty()
            || !self.created_dirs.is_empty()
            || !self.modified_files.is_empty()
            || !self.deleted_files.is_empty()
            || !self.deleted_dirs.is_empty()
            || !self.moved_files.is_empty()
            || !self.moved_dirs.is_empty()
    }

    pub(crate) fn has_pending_activity(&self) -> bool {
        self.has_emitable_changes() || !self.rename_from.is_empty()
    }

    pub(crate) fn next_rename_expiry_in(
        &self,
        rename_window: Duration,
        now: Instant,
    ) -> Option<Duration> {
        let oldest = self.rename_from.front()?;
        let deadline = oldest.seen_at + rename_window;
        if deadline <= now {
            return Some(Duration::from_millis(0));
        }
        Some(deadline.duration_since(now))
    }

    pub(crate) fn expire_stale_rename_from(
        &mut self,
        vault_root: &Path,
        now: Instant,
        rename_window: Duration,
    ) {
        while let Some(front) = self.rename_from.front() {
            let expired = now.duration_since(front.seen_at) >= rename_window;
            if !expired {
                break;
            }

            if let Some(expired) = self.rename_from.pop_front() {
                self.finalize_unmatched_rename_from(vault_root, expired);
            }
        }
    }

    pub(crate) fn flush_unmatched_rename_from_as_removed(&mut self, vault_root: &Path) {
        while let Some(from) = self.rename_from.pop_front() {
            self.finalize_unmatched_rename_from(vault_root, from);
        }
    }

    pub(super) fn match_rename_from(
        &mut self,
        now: Instant,
        rename_window: Duration,
        vault_root: &Path,
    ) -> Option<RenameFromCandidate> {
        self.expire_stale_rename_from(vault_root, now, rename_window);
        self.rename_from.pop_front()
    }

    pub(super) fn match_rename_from_by_tracker(
        &mut self,
        now: Instant,
        rename_window: Duration,
        vault_root: &Path,
        tracker: usize,
    ) -> Option<RenameFromCandidate> {
        self.expire_stale_rename_from(vault_root, now, rename_window);
        let position = self
            .rename_from
            .iter()
            .position(|candidate| candidate.tracker == Some(tracker))?;
        self.rename_from.remove(position)
    }

    pub(super) fn pending_rename_from_count(
        &mut self,
        now: Instant,
        rename_window: Duration,
        vault_root: &Path,
    ) -> usize {
        self.expire_stale_rename_from(vault_root, now, rename_window);
        self.rename_from.len()
    }

    pub(super) fn clear_pending_rename_from(&mut self) {
        self.rename_from.clear();
    }

    pub(crate) fn take_batch(
        &mut self,
        seq: u64,
        max_batch_paths: usize,
    ) -> Option<VaultChangeBatch> {
        if !self.has_emitable_changes() {
            return None;
        }

        self.normalize_for_emit(max_batch_paths);
        self.clear_details_if_needed();
        let batch = self.build_batch(seq);
        self.reset_emit_flags();

        if batch.has_payload() {
            Some(batch)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests;
