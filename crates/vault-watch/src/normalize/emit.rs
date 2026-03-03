use crate::types::{VaultChange, VaultChangeBatch, VaultEntryKind};

use super::PendingBatch;

impl PendingBatch {
    fn reconcile_created_and_deleted_as_modified(&mut self) {
        let created_and_deleted_files = self
            .created_files
            .intersection(&self.deleted_files)
            .cloned()
            .collect::<Vec<_>>();

        for rel_path in created_and_deleted_files {
            self.created_files.remove(&rel_path);
            self.deleted_files.remove(&rel_path);
            self.modified_files.insert(rel_path);
        }
    }

    fn drop_paths_covered_by_moves(&mut self) {
        for (from_rel, to_rel) in &self.moved_files {
            self.created_files.remove(from_rel);
            self.modified_files.remove(from_rel);
            self.deleted_files.remove(from_rel);
            self.created_files.remove(to_rel);
            self.modified_files.remove(to_rel);
            self.deleted_files.remove(to_rel);
        }

        for (from_rel, to_rel) in &self.moved_dirs {
            self.created_files.remove(from_rel);
            self.modified_files.remove(from_rel);
            self.deleted_files.remove(from_rel);
            self.created_dirs.remove(from_rel);
            self.deleted_dirs.remove(from_rel);
            self.created_files.remove(to_rel);
            self.modified_files.remove(to_rel);
            self.deleted_files.remove(to_rel);
            self.created_dirs.remove(to_rel);
            self.deleted_dirs.remove(to_rel);
        }
    }

    fn drop_descendant_file_paths_for_directory_changes(&mut self) {
        let mut prefixes = self.deleted_dirs.iter().cloned().collect::<Vec<_>>();
        for (from_rel, to_rel) in &self.moved_dirs {
            prefixes.push(from_rel.clone());
            prefixes.push(to_rel.clone());
        }

        for prefix in prefixes {
            let with_slash = format!("{prefix}/");
            self.created_files
                .retain(|path| !path.starts_with(&with_slash));
            self.modified_files
                .retain(|path| !path.starts_with(&with_slash));
            self.deleted_files
                .retain(|path| !path.starts_with(&with_slash));
            self.moved_files.retain(|(from_rel, to_rel)| {
                !from_rel.starts_with(&with_slash) && !to_rel.starts_with(&with_slash)
            });
        }
    }

    fn event_path_count(&self) -> usize {
        self.created_files.len()
            + self.created_dirs.len()
            + self.modified_files.len()
            + self.deleted_files.len()
            + self.deleted_dirs.len()
            + (self.moved_files.len() * 2)
            + (self.moved_dirs.len() * 2)
    }

    fn apply_overflow_policy(&mut self, max_batch_paths: usize) {
        if self.event_path_count() > max_batch_paths {
            self.mark_rescan(true);
        }
    }

    pub(super) fn normalize_for_emit(&mut self, max_batch_paths: usize) {
        self.reconcile_created_and_deleted_as_modified();
        self.drop_paths_covered_by_moves();
        self.drop_descendant_file_paths_for_directory_changes();
        self.apply_overflow_policy(max_batch_paths);
    }

    pub(super) fn clear_details_if_needed(&mut self) {
        if self.clear_details {
            self.created_files.clear();
            self.created_dirs.clear();
            self.modified_files.clear();
            self.deleted_files.clear();
            self.deleted_dirs.clear();
            self.moved_files.clear();
            self.moved_dirs.clear();
        }
    }

    pub(super) fn build_batch(&mut self, seq: u64) -> VaultChangeBatch {
        let mut batch = VaultChangeBatch::empty_with_seq(seq);
        batch.rescan = self.rescan;

        for rel_path in std::mem::take(&mut self.created_dirs) {
            batch.changes.push(VaultChange::Created {
                rel_path,
                entry_kind: VaultEntryKind::Directory,
            });
        }

        for rel_path in std::mem::take(&mut self.created_files) {
            batch.changes.push(VaultChange::Created {
                rel_path,
                entry_kind: VaultEntryKind::File,
            });
        }

        for rel_path in std::mem::take(&mut self.modified_files) {
            batch.changes.push(VaultChange::Modified {
                rel_path,
                entry_kind: VaultEntryKind::File,
            });
        }

        for rel_path in std::mem::take(&mut self.deleted_dirs) {
            batch.changes.push(VaultChange::Deleted {
                rel_path,
                entry_kind: VaultEntryKind::Directory,
            });
        }

        for rel_path in std::mem::take(&mut self.deleted_files) {
            batch.changes.push(VaultChange::Deleted {
                rel_path,
                entry_kind: VaultEntryKind::File,
            });
        }

        for (from_rel, to_rel) in std::mem::take(&mut self.moved_dirs) {
            batch.changes.push(VaultChange::Moved {
                from_rel,
                to_rel,
                entry_kind: VaultEntryKind::Directory,
            });
        }

        for (from_rel, to_rel) in std::mem::take(&mut self.moved_files) {
            batch.changes.push(VaultChange::Moved {
                from_rel,
                to_rel,
                entry_kind: VaultEntryKind::File,
            });
        }

        batch
    }

    pub(super) fn reset_emit_flags(&mut self) {
        self.rescan = false;
        self.clear_details = false;
    }
}
