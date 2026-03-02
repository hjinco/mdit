use std::{
    collections::{BTreeSet, VecDeque},
    path::Path,
    time::{Duration, Instant},
};

use notify::event::{ModifyKind, RenameMode};
use notify::EventKind;

use crate::{
    path::to_vault_rel_path,
    types::{EventBatch, RenamePair},
};

#[derive(Debug, Clone)]
struct RenameFromCandidate {
    rel_path: String,
    seen_at: Instant,
}

#[derive(Debug, Default)]
pub(crate) struct PendingBatch {
    created: BTreeSet<String>,
    modified: BTreeSet<String>,
    removed: BTreeSet<String>,
    renamed: BTreeSet<(String, String)>,
    rename_from: VecDeque<RenameFromCandidate>,
    rescan: bool,
    clear_details: bool,
}

impl PendingBatch {
    pub(crate) fn mark_rescan(&mut self, clear_details: bool) {
        self.rescan = true;
        self.clear_details |= clear_details;
    }

    pub(crate) fn has_emitable_changes(&self) -> bool {
        self.rescan
            || !self.created.is_empty()
            || !self.modified.is_empty()
            || !self.removed.is_empty()
            || !self.renamed.is_empty()
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

    pub(crate) fn expire_stale_rename_from(&mut self, now: Instant, rename_window: Duration) {
        while let Some(front) = self.rename_from.front() {
            let expired = now.duration_since(front.seen_at) >= rename_window;
            if !expired {
                break;
            }

            let expired = self.rename_from.pop_front();
            if let Some(expired) = expired {
                self.removed.insert(expired.rel_path);
            }
        }
    }

    pub(crate) fn flush_unmatched_rename_from_as_removed(&mut self) {
        while let Some(from) = self.rename_from.pop_front() {
            self.removed.insert(from.rel_path);
        }
    }

    pub(crate) fn apply_notify_event(
        &mut self,
        vault_root: &Path,
        event: &notify::Event,
        now: Instant,
        rename_window: Duration,
    ) {
        let rel_paths = event
            .paths
            .iter()
            .filter_map(|path| to_vault_rel_path(vault_root, path))
            .collect::<Vec<_>>();

        match event.kind {
            EventKind::Access(_) => {
                // Access events are usually noisy and not useful for content indexing.
            }
            EventKind::Create(_) => {
                self.created.extend(rel_paths);
            }
            EventKind::Modify(ModifyKind::Data(_)) | EventKind::Modify(ModifyKind::Metadata(_)) => {
                self.modified.extend(rel_paths);
            }
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
                self.handle_rename_both_event(vault_root, event);
            }
            EventKind::Modify(ModifyKind::Name(RenameMode::From)) => {
                self.handle_rename_from_event(rel_paths, now);
            }
            EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
                self.handle_rename_to_event(rel_paths, now, rename_window);
            }
            EventKind::Modify(ModifyKind::Name(_))
            | EventKind::Modify(ModifyKind::Any)
            | EventKind::Modify(ModifyKind::Other) => {
                self.mark_modified_or_rescan(rel_paths);
            }
            EventKind::Remove(_) => {
                self.removed.extend(rel_paths);
            }
            EventKind::Any | EventKind::Other => {
                self.mark_modified_or_rescan(rel_paths);
            }
        }
    }

    fn mark_modified_or_rescan(&mut self, rel_paths: Vec<String>) {
        if rel_paths.is_empty() {
            self.mark_rescan(false);
        } else {
            self.modified.extend(rel_paths);
        }
    }

    fn handle_rename_both_event(&mut self, vault_root: &Path, event: &notify::Event) {
        if event.paths.len() < 2 {
            self.mark_rescan(false);
            return;
        }

        let from_rel = to_vault_rel_path(vault_root, &event.paths[0]);
        let to_rel = to_vault_rel_path(vault_root, &event.paths[1]);

        match (from_rel, to_rel) {
            (Some(from), Some(to)) => {
                if from == to {
                    self.modified.insert(from);
                } else {
                    self.renamed.insert((from, to));
                }
            }
            (Some(from), None) => {
                self.removed.insert(from);
            }
            (None, Some(to)) => {
                self.created.insert(to);
            }
            (None, None) => {
                self.mark_rescan(false);
            }
        }

        for path in event.paths.iter().skip(2) {
            if let Some(rel_path) = to_vault_rel_path(vault_root, path) {
                self.modified.insert(rel_path);
            }
        }
    }

    fn handle_rename_from_event(&mut self, rel_paths: Vec<String>, now: Instant) {
        if rel_paths.is_empty() {
            self.mark_rescan(false);
            return;
        }

        for rel_path in rel_paths {
            self.rename_from.push_back(RenameFromCandidate {
                rel_path,
                seen_at: now,
            });
        }
    }

    fn handle_rename_to_event(
        &mut self,
        rel_paths: Vec<String>,
        now: Instant,
        rename_window: Duration,
    ) {
        if rel_paths.is_empty() {
            if let Some(from_rel) = self.match_rename_from(now, rename_window) {
                self.removed.insert(from_rel);
            } else {
                self.mark_rescan(false);
            }
            return;
        }

        for to_rel in rel_paths {
            if let Some(from_rel) = self.match_rename_from(now, rename_window) {
                if from_rel == to_rel {
                    self.modified.insert(to_rel);
                } else {
                    self.renamed.insert((from_rel, to_rel));
                }
            } else {
                self.created.insert(to_rel);
            }
        }
    }

    fn reconcile_created_and_removed_as_modified(&mut self) {
        let created_and_removed = self
            .created
            .intersection(&self.removed)
            .cloned()
            .collect::<Vec<_>>();
        for rel_path in created_and_removed {
            self.created.remove(&rel_path);
            self.removed.remove(&rel_path);
            self.modified.insert(rel_path);
        }
    }

    fn drop_paths_covered_by_renames(&mut self) {
        for (from_rel, to_rel) in &self.renamed {
            self.created.remove(from_rel);
            self.modified.remove(from_rel);
            self.removed.remove(from_rel);
            self.created.remove(to_rel);
            self.modified.remove(to_rel);
            self.removed.remove(to_rel);
        }
    }

    fn event_path_count(&self) -> usize {
        self.created.len() + self.modified.len() + self.removed.len() + (self.renamed.len() * 2)
    }

    fn apply_overflow_policy(&mut self, max_batch_paths: usize) {
        if self.event_path_count() > max_batch_paths {
            self.mark_rescan(true);
        }
    }

    fn normalize_for_emit(&mut self, max_batch_paths: usize) {
        self.reconcile_created_and_removed_as_modified();
        self.drop_paths_covered_by_renames();
        self.apply_overflow_policy(max_batch_paths);
    }

    fn clear_details_if_needed(&mut self) {
        if self.clear_details {
            self.created.clear();
            self.modified.clear();
            self.removed.clear();
            self.renamed.clear();
        }
    }

    fn build_batch(&mut self, seq: u64) -> EventBatch {
        let mut batch = EventBatch::empty_with_seq(seq);
        batch.rescan = self.rescan;
        batch.vault_rel_created = std::mem::take(&mut self.created).into_iter().collect();
        batch.vault_rel_modified = std::mem::take(&mut self.modified).into_iter().collect();
        batch.vault_rel_removed = std::mem::take(&mut self.removed).into_iter().collect();
        batch.vault_rel_renamed = std::mem::take(&mut self.renamed)
            .into_iter()
            .map(|(from_rel, to_rel)| RenamePair { from_rel, to_rel })
            .collect();
        batch
    }

    fn reset_emit_flags(&mut self) {
        self.rescan = false;
        self.clear_details = false;
    }

    fn match_rename_from(&mut self, now: Instant, rename_window: Duration) -> Option<String> {
        self.expire_stale_rename_from(now, rename_window);
        self.rename_from.pop_front().map(|entry| entry.rel_path)
    }

    pub(crate) fn take_batch(&mut self, seq: u64, max_batch_paths: usize) -> Option<EventBatch> {
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
