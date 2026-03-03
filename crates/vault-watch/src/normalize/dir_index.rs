use std::path::Path;

use crate::{path::to_vault_rel_path, types::VaultEntryKind};

use super::PendingBatch;

impl PendingBatch {
    pub(super) fn record_created(
        &mut self,
        rel_path: String,
        entry_kind: VaultEntryKind,
        vault_root: &Path,
    ) {
        match entry_kind {
            VaultEntryKind::File => {
                self.created_files.insert(rel_path);
            }
            VaultEntryKind::Directory => {
                self.created_dirs.insert(rel_path.clone());
                self.add_directory_subtree(vault_root, &rel_path);
            }
        }
    }

    pub(super) fn record_deleted(&mut self, rel_path: String, entry_kind: VaultEntryKind) {
        match entry_kind {
            VaultEntryKind::File => {
                self.deleted_files.insert(rel_path);
            }
            VaultEntryKind::Directory => {
                self.deleted_dirs.insert(rel_path.clone());
                self.remove_directory_prefix(&rel_path);
            }
        }
    }

    pub(super) fn record_moved(
        &mut self,
        from_rel: String,
        to_rel: String,
        entry_kind: VaultEntryKind,
        vault_root: &Path,
    ) {
        let from_hidden = self.is_hidden_rel_path(&from_rel);
        let to_hidden = self.is_hidden_rel_path(&to_rel);

        if from_hidden && to_hidden {
            return;
        }

        if from_hidden {
            self.record_created(to_rel, entry_kind, vault_root);
            return;
        }

        if to_hidden {
            self.record_deleted(from_rel, entry_kind);
            return;
        }

        match entry_kind {
            VaultEntryKind::File => {
                self.moved_files.insert((from_rel, to_rel));
            }
            VaultEntryKind::Directory => {
                self.moved_dirs.insert((from_rel.clone(), to_rel.clone()));
                self.move_directory_prefix(&from_rel, &to_rel);
                self.add_directory_subtree(vault_root, &to_rel);
            }
        }
    }

    fn add_directory_subtree(&mut self, vault_root: &Path, rel_path: &str) {
        self.known_dirs.insert(rel_path.to_string());

        let root_path = vault_root.join(rel_path);
        let Ok(metadata) = std::fs::metadata(&root_path) else {
            return;
        };
        if !metadata.is_dir() {
            return;
        }

        let mut stack = vec![root_path];
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
                if let Some(child_rel) = to_vault_rel_path(vault_root, &path) {
                    self.known_dirs.insert(child_rel);
                }
                stack.push(path);
            }
        }
    }

    fn remove_directory_prefix(&mut self, rel_path: &str) {
        let rel_prefix = format!("{rel_path}/");
        self.known_dirs
            .retain(|known| known != rel_path && !known.starts_with(&rel_prefix));
    }

    fn move_directory_prefix(&mut self, from_rel: &str, to_rel: &str) {
        let from_prefix = format!("{from_rel}/");
        let candidates = self
            .known_dirs
            .iter()
            .filter(|known| **known == *from_rel || known.starts_with(&from_prefix))
            .cloned()
            .collect::<Vec<_>>();

        if candidates.is_empty() {
            return;
        }

        for old_rel in &candidates {
            self.known_dirs.remove(old_rel);
        }

        for old_rel in candidates {
            let mapped = if old_rel == from_rel {
                to_rel.to_string()
            } else {
                let suffix = &old_rel[from_rel.len()..];
                format!("{to_rel}{suffix}")
            };
            self.known_dirs.insert(mapped);
        }
    }

    pub(super) fn infer_entry_kind(
        &self,
        vault_root: &Path,
        rel_path: &str,
        path_hint: Option<&Path>,
    ) -> Option<VaultEntryKind> {
        if self.is_directory(rel_path) || self.has_directory_descendant(rel_path) {
            return Some(VaultEntryKind::Directory);
        }

        let candidate_path = match path_hint {
            Some(path) => path.to_path_buf(),
            None => vault_root.join(rel_path),
        };

        let metadata = std::fs::metadata(candidate_path).ok()?;
        if metadata.is_dir() {
            return Some(VaultEntryKind::Directory);
        }
        if metadata.is_file() {
            return Some(VaultEntryKind::File);
        }
        None
    }

    pub(super) fn is_directory(&self, rel_path: &str) -> bool {
        self.known_dirs.contains(rel_path)
    }

    pub(super) fn has_directory_descendant(&self, rel_path: &str) -> bool {
        let prefix = format!("{rel_path}/");
        self.known_dirs
            .iter()
            .any(|known| known.starts_with(&prefix))
    }
}
