use std::{
    fs::{self, Metadata},
    io,
    path::Path,
};

use crate::{
    path::{is_hidden_vault_rel_path, to_vault_rel_path},
    types::VaultEntryState,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum WalkErrorPolicy {
    Ignore,
    Propagate,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct VisibleEntry {
    pub rel_path: String,
    pub state: VaultEntryState,
}

pub(crate) fn entry_state_from_path(path: &Path) -> VaultEntryState {
    match fs::symlink_metadata(path) {
        Ok(metadata) => entry_state_from_metadata(&metadata),
        Err(error) if error.kind() == io::ErrorKind::NotFound => VaultEntryState::Missing,
        Err(_) => VaultEntryState::Unknown,
    }
}

pub(crate) fn walk_visible_descendants(
    vault_root: &Path,
    walk_root: &Path,
    error_policy: WalkErrorPolicy,
) -> io::Result<Vec<VisibleEntry>> {
    let mut visible_entries = Vec::new();
    let mut walker = walkdir::WalkDir::new(walk_root)
        .min_depth(1)
        .follow_links(false)
        .into_iter();

    while let Some(entry) = walker.next() {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => match error_policy {
                WalkErrorPolicy::Ignore => continue,
                WalkErrorPolicy::Propagate => return Err(io::Error::other(error)),
            },
        };

        if entry.file_type().is_symlink() {
            continue;
        }

        let Some(state) = entry_state_from_file_type(entry.file_type()) else {
            continue;
        };

        let Some(rel_path) = to_vault_rel_path(vault_root, entry.path()) else {
            continue;
        };

        if is_hidden_vault_rel_path(&rel_path) {
            if entry.file_type().is_dir() {
                walker.skip_current_dir();
            }
            continue;
        }

        visible_entries.push(VisibleEntry { rel_path, state });
    }

    Ok(visible_entries)
}

fn entry_state_from_metadata(metadata: &Metadata) -> VaultEntryState {
    if metadata.file_type().is_symlink() {
        VaultEntryState::Unknown
    } else if metadata.is_dir() {
        VaultEntryState::Directory
    } else if metadata.is_file() {
        VaultEntryState::File
    } else {
        VaultEntryState::Unknown
    }
}

fn entry_state_from_file_type(file_type: fs::FileType) -> Option<VaultEntryState> {
    if file_type.is_dir() {
        Some(VaultEntryState::Directory)
    } else if file_type.is_file() {
        Some(VaultEntryState::File)
    } else {
        None
    }
}
