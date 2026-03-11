use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};

use anyhow::Result;

use crate::{
    types::{LocalSyncManifest, LocalSyncManifestEntry, SyncEntryRecord, SyncVaultState},
    util::now_iso_string,
};

pub(crate) fn build_manifest(
    sync_vault_state: &SyncVaultState,
    entries: &[SyncEntryRecord],
) -> LocalSyncManifest {
    let mut manifest_entries = entries
        .iter()
        .map(|entry| {
            if entry.kind == "dir" {
                LocalSyncManifestEntry::Dir {
                    entry_id: entry.entry_id.clone(),
                    parent_entry_id: entry.parent_entry_id.clone(),
                    name: entry.name.clone(),
                }
            } else {
                LocalSyncManifestEntry::File {
                    entry_id: entry.entry_id.clone(),
                    parent_entry_id: entry.parent_entry_id.clone(),
                    name: entry.name.clone(),
                    blob_id: entry
                        .last_synced_blob_id
                        .clone()
                        .or_else(|| entry.last_known_content_hash.clone())
                        .unwrap_or_default(),
                    content_hash: entry.last_known_content_hash.clone().unwrap_or_default(),
                    size: entry.last_known_size.unwrap_or_default() as u64,
                    modified_at: entry.last_known_mtime_ns.unwrap_or_default(),
                }
            }
        })
        .collect::<Vec<_>>();

    manifest_entries
        .sort_by(|left, right| manifest_entry_sort_key(left).cmp(&manifest_entry_sort_key(right)));

    LocalSyncManifest {
        manifest_version: 1,
        vault_id: sync_vault_state.vault_id,
        base_commit_id: sync_vault_state.last_synced_commit_id.clone(),
        generated_at: now_iso_string(),
        entries: manifest_entries,
    }
}

pub(crate) fn finalize_manifest_blob_ids(
    manifest: &LocalSyncManifest,
    blob_ids_by_entry_id: &HashMap<String, String>,
) -> LocalSyncManifest {
    let mut final_manifest = manifest.clone();
    for entry in &mut final_manifest.entries {
        if let LocalSyncManifestEntry::File {
            entry_id, blob_id, ..
        } = entry
        {
            if let Some(next_blob_id) = blob_ids_by_entry_id.get(entry_id) {
                *blob_id = next_blob_id.clone();
            }
        }
    }

    final_manifest
}

pub(crate) fn manifest_entry_id(entry: &LocalSyncManifestEntry) -> &str {
    match entry {
        LocalSyncManifestEntry::Dir { entry_id, .. } => entry_id,
        LocalSyncManifestEntry::File { entry_id, .. } => entry_id,
    }
}

pub(crate) fn build_manifest_paths(
    manifest: &LocalSyncManifest,
) -> Result<HashMap<String, PathBuf>> {
    let entry_map = manifest
        .entries
        .iter()
        .map(|entry| (manifest_entry_id(entry).to_string(), entry))
        .collect::<HashMap<_, _>>();
    let mut resolved = HashMap::new();
    let mut active = HashSet::new();

    for entry in &manifest.entries {
        let entry_id = manifest_entry_id(entry).to_string();
        let path = resolve_manifest_entry_path(&entry_map, &entry_id, &mut resolved, &mut active)?;
        resolved.insert(entry_id, path);
    }

    Ok(resolved)
}

fn manifest_entry_sort_key(entry: &LocalSyncManifestEntry) -> (&str, &str) {
    match entry {
        LocalSyncManifestEntry::Dir {
            parent_entry_id,
            name,
            ..
        } => (parent_entry_id.as_deref().unwrap_or(""), name.as_str()),
        LocalSyncManifestEntry::File {
            parent_entry_id,
            name,
            ..
        } => (parent_entry_id.as_deref().unwrap_or(""), name.as_str()),
    }
}

fn resolve_manifest_entry_path<'a>(
    entry_map: &'a HashMap<String, &'a LocalSyncManifestEntry>,
    entry_id: &str,
    resolved: &mut HashMap<String, PathBuf>,
    active: &mut HashSet<String>,
) -> Result<PathBuf> {
    if let Some(path) = resolved.get(entry_id) {
        return Ok(path.clone());
    }
    if !active.insert(entry_id.to_string()) {
        return Err(anyhow::anyhow!(
            "Detected cyclic parent relationship in manifest for entry {entry_id}"
        ));
    }

    let entry = entry_map
        .get(entry_id)
        .copied()
        .ok_or_else(|| anyhow::anyhow!("Manifest entry {entry_id} was not found"))?;
    let (parent_entry_id, name) = match entry {
        LocalSyncManifestEntry::Dir {
            parent_entry_id,
            name,
            ..
        } => (parent_entry_id.as_deref(), name.as_str()),
        LocalSyncManifestEntry::File {
            parent_entry_id,
            name,
            ..
        } => (parent_entry_id.as_deref(), name.as_str()),
    };

    validate_manifest_name(name)?;

    let mut path = if let Some(parent_entry_id) = parent_entry_id {
        resolve_manifest_entry_path(entry_map, parent_entry_id, resolved, active)?
    } else {
        PathBuf::new()
    };
    path.push(name);

    active.remove(entry_id);
    resolved.insert(entry_id.to_string(), path.clone());
    Ok(path)
}

fn validate_manifest_name(name: &str) -> Result<()> {
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.starts_with('.')
        || name.contains('/')
        || name.contains('\\')
    {
        return Err(anyhow::anyhow!("Invalid manifest entry name: {name}"));
    }

    Ok(())
}
