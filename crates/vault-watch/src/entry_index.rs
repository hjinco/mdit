use std::{
    collections::{BTreeMap, HashMap},
    io,
    path::Path,
};

use crate::{
    path::is_hidden_vault_rel_path,
    scan::{entry_state_from_path, walk_visible_descendants, WalkErrorPolicy},
    types::{VaultEntryKind, VaultEntryState},
};

#[derive(Debug)]
pub(crate) struct EntryIndex {
    known_entries: HashMap<String, VaultEntryState>,
    trusted: bool,
}

impl EntryIndex {
    pub(crate) fn new(known_entries: HashMap<String, VaultEntryState>, trusted: bool) -> Self {
        Self {
            known_entries,
            trusted,
        }
    }

    pub(crate) fn is_trusted(&self) -> bool {
        self.trusted
    }

    pub(crate) fn get(&self, rel_path: &str) -> Option<&VaultEntryState> {
        self.known_entries.get(rel_path)
    }

    pub(crate) fn get_or_missing(&self, rel_path: &str) -> VaultEntryState {
        self.get(rel_path)
            .copied()
            .unwrap_or(VaultEntryState::Missing)
    }

    #[cfg(test)]
    pub(crate) fn known_entry_count(&self) -> usize {
        self.known_entries.len()
    }

    pub(crate) fn known_entry_kind(&self, rel_path: &str) -> Option<VaultEntryKind> {
        match self.get(rel_path) {
            Some(VaultEntryState::File) => Some(VaultEntryKind::File),
            Some(VaultEntryState::Directory) => Some(VaultEntryKind::Directory),
            _ => None,
        }
    }

    pub(crate) fn has_known_entry_or_descendant(&self, rel_path: &str) -> bool {
        let rel_prefix = format!("{rel_path}/");
        self.known_entries
            .keys()
            .any(|known| known == rel_path || known.starts_with(&rel_prefix))
    }

    pub(crate) fn rebuild_from_fs(&mut self, vault_root: &Path) -> io::Result<()> {
        self.known_entries = collect_entry_index(vault_root)?;
        self.trusted = true;
        Ok(())
    }

    pub(crate) fn clear_untrusted(&mut self) {
        self.known_entries.clear();
        self.trusted = false;
    }

    pub(crate) fn apply_moves(&mut self, moves: &BTreeMap<(String, String), VaultEntryKind>) {
        for ((from_rel, to_rel), entry_kind) in moves {
            match entry_kind {
                VaultEntryKind::File => {
                    self.known_entries.remove(from_rel);
                    self.known_entries
                        .insert(to_rel.clone(), VaultEntryState::File);
                }
                VaultEntryKind::Directory => {
                    rename_prefix(&mut self.known_entries, from_rel, to_rel);
                }
            }
        }
    }

    pub(crate) fn apply_path_state_updates(&mut self, updates: Vec<(String, VaultEntryState)>) {
        for (rel_path, state) in updates {
            set_entry_state(&mut self.known_entries, &rel_path, state);
        }
    }

    pub(crate) fn refresh_prefix_from_fs(&mut self, vault_root: &Path, rel_prefix: &str) {
        remove_prefix(&mut self.known_entries, rel_prefix);
        if is_hidden_vault_rel_path(rel_prefix) {
            return;
        }

        let root_path = vault_root.join(rel_prefix);
        let root_state = entry_state_from_path(&root_path);
        if matches!(root_state, VaultEntryState::Missing) {
            return;
        }

        self.known_entries
            .insert(rel_prefix.to_string(), root_state);
        if !matches!(root_state, VaultEntryState::Directory) {
            return;
        }

        if let Ok(entries) =
            walk_visible_descendants(vault_root, &root_path, WalkErrorPolicy::Ignore)
        {
            for entry in entries {
                self.known_entries.insert(entry.rel_path, entry.state);
            }
        }
    }
}

pub(crate) fn collect_entry_index(
    vault_root: &Path,
) -> io::Result<HashMap<String, VaultEntryState>> {
    let mut known_entries = HashMap::new();
    for entry in walk_visible_descendants(vault_root, vault_root, WalkErrorPolicy::Propagate)? {
        known_entries.insert(entry.rel_path, entry.state);
    }

    Ok(known_entries)
}

fn set_entry_state(
    known_entries: &mut HashMap<String, VaultEntryState>,
    rel_path: &str,
    state: VaultEntryState,
) {
    match state {
        VaultEntryState::Missing => remove_prefix(known_entries, rel_path),
        VaultEntryState::File => {
            remove_prefix(known_entries, rel_path);
            known_entries.insert(rel_path.to_string(), VaultEntryState::File);
        }
        VaultEntryState::Directory => {
            known_entries.insert(rel_path.to_string(), VaultEntryState::Directory);
        }
        VaultEntryState::Unknown => {
            remove_prefix(known_entries, rel_path);
            known_entries.insert(rel_path.to_string(), VaultEntryState::Unknown);
        }
    }
}

fn remove_prefix(known_entries: &mut HashMap<String, VaultEntryState>, rel_path: &str) {
    let rel_prefix = format!("{rel_path}/");
    known_entries.retain(|known, _| known != rel_path && !known.starts_with(&rel_prefix));
}

fn rename_prefix(
    known_entries: &mut HashMap<String, VaultEntryState>,
    from_rel: &str,
    to_rel: &str,
) {
    let from_prefix = format!("{from_rel}/");
    let candidates = known_entries
        .iter()
        .filter_map(|(known, state)| {
            if known == from_rel || known.starts_with(&from_prefix) {
                Some((known.clone(), *state))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    for (old_rel, _) in &candidates {
        known_entries.remove(old_rel);
    }

    for (old_rel, state) in candidates {
        let mapped = if old_rel == from_rel {
            to_rel.to_string()
        } else {
            format!("{to_rel}{}", &old_rel[from_rel.len()..])
        };
        known_entries.insert(mapped, state);
    }
}
