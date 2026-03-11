use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};

use anyhow::Result;

use crate::{
    manifest::{build_manifest_paths, manifest_entry_id},
    types::{
        ApplyRemoteSyncFileInput, ApplyRemoteWorkspaceInput, LocalSyncManifest,
        LocalSyncManifestEntry,
    },
};

#[derive(Debug, Clone)]
pub(crate) struct ApplyPlan {
    pub(crate) manifest: LocalSyncManifest,
    pub(crate) file_payloads: HashMap<String, ApplyRemoteSyncFileInput>,
    pub(crate) manifest_paths: HashMap<String, PathBuf>,
    pub(crate) manifest_entry_ids: HashSet<String>,
    pub(crate) remote_vault_id: String,
    pub(crate) last_synced_commit_id: String,
    pub(crate) current_key_version: i64,
    pub(crate) provided_files_count: usize,
}

impl ApplyPlan {
    pub(crate) fn file_payload(&self, entry_id: &str) -> Result<&ApplyRemoteSyncFileInput> {
        self.file_payloads.get(entry_id).ok_or_else(|| {
            anyhow::anyhow!("Missing decrypted payload for manifest file entry {entry_id}")
        })
    }

    pub(crate) fn absolute_path<'a>(
        &'a self,
        workspace_root: &std::path::Path,
        entry_id: &str,
        kind: &'static str,
    ) -> Result<PathBuf> {
        let relative_path = self.manifest_paths.get(entry_id).ok_or_else(|| {
            anyhow::anyhow!("Missing relative path for manifest {kind} {entry_id}")
        })?;
        Ok(workspace_root.join(relative_path))
    }
}

pub(crate) fn validate_apply_input(input: ApplyRemoteWorkspaceInput) -> Result<ApplyPlan> {
    let manifest_paths = build_manifest_paths(&input.manifest)?;
    let file_payloads = input
        .files
        .into_iter()
        .map(|file| (file.entry_id.clone(), file))
        .collect::<HashMap<_, _>>();

    for entry in &input.manifest.entries {
        if let LocalSyncManifestEntry::File {
            entry_id, blob_id, ..
        } = entry
        {
            let payload = file_payloads.get(entry_id).ok_or_else(|| {
                anyhow::anyhow!("Missing decrypted payload for manifest file entry {entry_id}")
            })?;
            if payload.blob_id != *blob_id {
                return Err(anyhow::anyhow!(
                    "Mismatched blob id for manifest file entry {entry_id}"
                ));
            }
        }
    }

    let manifest_entry_ids = input
        .manifest
        .entries
        .iter()
        .map(manifest_entry_id)
        .map(str::to_string)
        .collect::<HashSet<_>>();

    let provided_files_count = file_payloads.len();

    Ok(ApplyPlan {
        manifest: input.manifest,
        file_payloads,
        manifest_paths,
        manifest_entry_ids,
        remote_vault_id: input.remote_vault_id,
        last_synced_commit_id: input.last_synced_commit_id,
        current_key_version: input.current_key_version,
        provided_files_count,
    })
}
