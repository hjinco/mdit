use std::{fs, path::Path};

use anyhow::{Context, Result};

use crate::{
    constants::{
        ENTRY_KIND_DIR, ENTRY_KIND_FILE, EXCLUSION_REASON_READ_FAILED,
        EXCLUSION_REASON_SIZE_LIMIT_EXCEEDED, EXCLUSION_REASON_SYMLINK,
    },
    store::RecordSyncExclusionEventInput,
    types::ScanOptions,
    util::{modified_time_ns, relative_workspace_path},
};

#[derive(Debug, Clone)]
pub(crate) struct ObservedNode {
    pub(crate) name: String,
    pub(crate) kind: &'static str,
    pub(crate) local_path: String,
    pub(crate) parent_local_path: Option<String>,
    pub(crate) last_known_size: Option<i64>,
    pub(crate) last_known_mtime_ns: Option<i64>,
    pub(crate) last_known_content_hash: Option<String>,
}

#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct ScanStats {
    pub(crate) files_scanned: usize,
    pub(crate) directories_scanned: usize,
}

#[derive(Debug, Default)]
pub(crate) struct WalkOutput {
    pub(crate) observed_nodes: Vec<ObservedNode>,
    pub(crate) exclusion_events: Vec<RecordSyncExclusionEventInput>,
    pub(crate) stats: ScanStats,
}

pub(crate) fn walk_workspace(workspace_root: &Path, options: &ScanOptions) -> Result<WalkOutput> {
    let mut output = WalkOutput::default();
    walk_directory(workspace_root, workspace_root, None, options, &mut output)?;
    Ok(output)
}

fn walk_directory(
    workspace_root: &Path,
    directory_path: &Path,
    parent_local_path: Option<&str>,
    options: &ScanOptions,
    output: &mut WalkOutput,
) -> Result<()> {
    let children = fs::read_dir(directory_path).with_context(|| {
        format!(
            "Failed to read workspace directory {}",
            directory_path.display()
        )
    })?;
    let mut children = children
        .collect::<std::io::Result<Vec<_>>>()
        .with_context(|| {
            format!(
                "Failed to read directory entries in {}",
                directory_path.display()
            )
        })?;
    children.sort_by(|left, right| left.file_name().cmp(&right.file_name()));

    for entry in children {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .with_context(|| format!("Failed to read metadata for {}", path.display()))?;

        if metadata.file_type().is_symlink() {
            output.exclusion_events.push(RecordSyncExclusionEventInput {
                local_path: relative_workspace_path(workspace_root, &path)?,
                reason: EXCLUSION_REASON_SYMLINK.to_string(),
            });
            continue;
        }

        if metadata.is_dir() {
            output.stats.directories_scanned += 1;
            let local_path = relative_workspace_path(workspace_root, &path)?;
            output.observed_nodes.push(ObservedNode {
                name,
                kind: ENTRY_KIND_DIR,
                local_path: local_path.clone(),
                parent_local_path: parent_local_path.map(str::to_string),
                last_known_size: None,
                last_known_mtime_ns: None,
                last_known_content_hash: None,
            });
            walk_directory(workspace_root, &path, Some(&local_path), options, output)?;
            continue;
        }

        if !metadata.is_file() {
            continue;
        }

        if let Some(max_file_size_bytes) = options.max_file_size_bytes {
            if metadata.len() > max_file_size_bytes {
                output.exclusion_events.push(RecordSyncExclusionEventInput {
                    local_path: relative_workspace_path(workspace_root, &path)?,
                    reason: EXCLUSION_REASON_SIZE_LIMIT_EXCEEDED.to_string(),
                });
                continue;
            }
        }

        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(_) => {
                output.exclusion_events.push(RecordSyncExclusionEventInput {
                    local_path: relative_workspace_path(workspace_root, &path)?,
                    reason: EXCLUSION_REASON_READ_FAILED.to_string(),
                });
                continue;
            }
        };

        output.stats.files_scanned += 1;
        output.observed_nodes.push(ObservedNode {
            name,
            kind: ENTRY_KIND_FILE,
            local_path: relative_workspace_path(workspace_root, &path)?,
            parent_local_path: parent_local_path.map(str::to_string),
            last_known_size: i64::try_from(metadata.len()).ok(),
            last_known_mtime_ns: modified_time_ns(&metadata),
            last_known_content_hash: Some(blake3::hash(&bytes).to_hex().to_string()),
        });
    }

    Ok(())
}
