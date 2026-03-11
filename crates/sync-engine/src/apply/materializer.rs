use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use base64::Engine;

use crate::{constants::ENTRY_KIND_DIR, types::LocalSyncManifestEntry};

use super::{
    conflicts::{ApplyDecisions, FileApplyAction},
    validator::ApplyPlan,
};

pub(crate) fn materialize_workspace(
    workspace_root: &Path,
    plan: &ApplyPlan,
    decisions: &ApplyDecisions,
) -> Result<()> {
    let mut target_paths = plan
        .manifest_paths
        .values()
        .map(|relative_path| workspace_root.join(relative_path))
        .collect::<HashSet<_>>();
    target_paths.extend(decisions.protected_paths.iter().cloned());
    for retained in &decisions.retained_deleted_entries {
        target_paths.insert(retained.path.clone());
    }
    protect_ancestor_directories(workspace_root, &mut target_paths);
    delete_stale_workspace_entries(workspace_root, &target_paths)?;

    for entry in &plan.manifest.entries {
        if let LocalSyncManifestEntry::Dir { entry_id, .. } = entry {
            let absolute_path = plan.absolute_path(workspace_root, entry_id, ENTRY_KIND_DIR)?;
            ensure_directory_path(&absolute_path)?;
        }
    }

    for entry in &plan.manifest.entries {
        let LocalSyncManifestEntry::File { entry_id, .. } = entry else {
            continue;
        };

        let outcome = decisions.file_outcomes.get(entry_id).ok_or_else(|| {
            anyhow::anyhow!("Missing file apply outcome for manifest entry {entry_id}")
        })?;
        let payload = plan.file_payload(entry_id)?;

        match &outcome.action {
            FileApplyAction::WriteRemotePayload => {
                let plaintext = base64::engine::general_purpose::STANDARD
                    .decode(&payload.plaintext_base64)
                    .context("Failed to decode decrypted file payload")?;
                write_file_bytes(&outcome.path, &plaintext)?;
            }
            FileApplyAction::WriteBytes(bytes) => write_file_bytes(&outcome.path, bytes)?,
            FileApplyAction::KeepLocal => {}
        }
    }

    Ok(())
}

fn protect_ancestor_directories(workspace_root: &Path, target_paths: &mut HashSet<PathBuf>) {
    let mut ancestors = Vec::new();
    for path in target_paths.iter() {
        let mut current = path.parent();
        while let Some(parent) = current {
            if parent == workspace_root {
                break;
            }
            ancestors.push(parent.to_path_buf());
            current = parent.parent();
        }
    }
    target_paths.extend(ancestors);
}

fn delete_stale_workspace_entries(
    workspace_root: &Path,
    target_paths: &HashSet<PathBuf>,
) -> Result<()> {
    let mut existing_paths = collect_workspace_sync_paths(workspace_root)?;
    existing_paths.sort_by(|left, right| {
        right
            .components()
            .count()
            .cmp(&left.components().count())
            .then_with(|| right.cmp(left))
    });

    for path in existing_paths {
        if target_paths.contains(&path) {
            continue;
        }

        let metadata = fs::symlink_metadata(&path).with_context(|| {
            format!(
                "Failed to read workspace metadata while deleting stale path: {}",
                path.display()
            )
        })?;
        if metadata.file_type().is_symlink() {
            continue;
        }

        if metadata.is_dir() {
            fs::remove_dir_all(&path).with_context(|| {
                format!(
                    "Failed to remove stale workspace directory {}",
                    path.display()
                )
            })?;
        } else {
            fs::remove_file(&path).with_context(|| {
                format!("Failed to remove stale workspace file {}", path.display())
            })?;
        }
    }

    Ok(())
}

fn collect_workspace_sync_paths(current: &Path) -> Result<Vec<PathBuf>> {
    let mut paths = Vec::new();
    for child in fs::read_dir(current)
        .with_context(|| format!("Failed to read workspace directory {}", current.display()))?
    {
        let child = child?;
        let path = child.path();
        let name = child.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        let metadata = fs::symlink_metadata(&path)
            .with_context(|| format!("Failed to read metadata for {}", path.display()))?;
        paths.push(path.clone());

        if metadata.is_dir() && !metadata.file_type().is_symlink() {
            paths.extend(collect_workspace_sync_paths(&path)?);
        }
    }

    Ok(paths)
}

fn ensure_directory_path(path: &Path) -> Result<()> {
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() {
            return Err(anyhow::anyhow!(
                "Cannot apply sync payload over symlink directory {}",
                path.display()
            ));
        }
        if metadata.is_file() {
            fs::remove_file(path).with_context(|| {
                format!("Failed to replace file with directory {}", path.display())
            })?;
        }
    }

    fs::create_dir_all(path)
        .with_context(|| format!("Failed to create synced directory {}", path.display()))
}

fn write_file_bytes(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create parent directory for {}", path.display()))?;
    }

    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() {
            return Err(anyhow::anyhow!(
                "Cannot apply sync payload over symlink file {}",
                path.display()
            ));
        }
        if metadata.is_dir() {
            fs::remove_dir_all(path).with_context(|| {
                format!("Failed to replace directory with file {}", path.display())
            })?;
        }
    }

    fs::write(path, bytes)
        .with_context(|| format!("Failed to write synced file {}", path.display()))
}
