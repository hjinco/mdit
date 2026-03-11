use std::path::Path;

use anyhow::{Context, Result};

use crate::{
    constants::{ENTRY_KIND_DIR, ENTRY_KIND_FILE, SYNC_STATE_CONFLICTED, SYNC_STATE_SYNCED},
    manifest::manifest_entry_id,
    store::{PersistSyncStateInput, SaveSyncVaultStateInput, UpsertSyncEntryInput},
    types::{LocalSyncManifestEntry, SyncEntryRecord, SyncVaultState},
    util::{modified_time_ns, relative_workspace_path},
};

use super::{conflicts::ApplyDecisions, validator::ApplyPlan};

pub(crate) struct PreparedApplyState {
    pub(crate) persist_input: PersistSyncStateInput,
    pub(crate) entries_deleted: usize,
}

pub(crate) fn prepare_applied_state(
    workspace_root: &Path,
    plan: &ApplyPlan,
    existing_entries: Vec<SyncEntryRecord>,
    previous_vault_state: Option<SyncVaultState>,
    decisions: &ApplyDecisions,
) -> Result<PreparedApplyState> {
    let mut entries_deleted = 0usize;
    let mut deleted_entry_ids = Vec::new();
    for entry in existing_entries {
        if !plan.manifest_entry_ids.contains(entry.entry_id.as_str())
            && decisions
                .retained_deleted_entries
                .iter()
                .all(|retained| retained.entry.entry_id != entry.entry_id)
        {
            deleted_entry_ids.push(entry.entry_id);
            entries_deleted += 1;
        }
    }

    let mut upsert_entries = Vec::new();
    for entry in &plan.manifest.entries {
        let entry_id = manifest_entry_id(entry).to_string();

        match entry {
            LocalSyncManifestEntry::Dir {
                parent_entry_id,
                name,
                ..
            } => {
                let absolute_path =
                    plan.absolute_path(workspace_root, &entry_id, ENTRY_KIND_DIR)?;
                let metadata = std::fs::metadata(&absolute_path).with_context(|| {
                    format!(
                        "Failed to read synced directory metadata: {}",
                        absolute_path.display()
                    )
                })?;
                upsert_entries.push(UpsertSyncEntryInput {
                    entry_id,
                    parent_entry_id: parent_entry_id.clone(),
                    name: name.clone(),
                    kind: ENTRY_KIND_DIR.to_string(),
                    local_path: relative_workspace_path(workspace_root, &absolute_path)?,
                    last_known_size: None,
                    last_known_mtime_ns: modified_time_ns(&metadata),
                    last_known_content_hash: None,
                    last_synced_blob_id: None,
                    last_synced_content_hash: None,
                    sync_state: SYNC_STATE_SYNCED.to_string(),
                });
            }
            LocalSyncManifestEntry::File {
                parent_entry_id,
                name,
                blob_id,
                content_hash,
                ..
            } => {
                let outcome = decisions.file_outcomes.get(&entry_id).ok_or_else(|| {
                    anyhow::anyhow!("Missing file apply outcome while persisting {entry_id}")
                })?;
                let metadata = std::fs::metadata(&outcome.path).with_context(|| {
                    format!(
                        "Failed to read synced file metadata: {}",
                        outcome.path.display()
                    )
                })?;
                let content_bytes = std::fs::read(&outcome.path).with_context(|| {
                    format!(
                        "Failed to read synced file content hash: {}",
                        outcome.path.display()
                    )
                })?;
                upsert_entries.push(UpsertSyncEntryInput {
                    entry_id,
                    parent_entry_id: parent_entry_id.clone(),
                    name: name.clone(),
                    kind: ENTRY_KIND_FILE.to_string(),
                    local_path: relative_workspace_path(workspace_root, &outcome.path)?,
                    last_known_size: i64::try_from(metadata.len()).ok(),
                    last_known_mtime_ns: modified_time_ns(&metadata),
                    last_known_content_hash: Some(
                        blake3::hash(&content_bytes).to_hex().to_string(),
                    ),
                    last_synced_blob_id: Some(blob_id.clone()),
                    last_synced_content_hash: Some(content_hash.clone()),
                    sync_state: outcome.sync_state.clone(),
                });
            }
        }
    }

    for retained in &decisions.retained_deleted_entries {
        let metadata = std::fs::metadata(&retained.path).with_context(|| {
            format!(
                "Failed to read retained conflict metadata: {}",
                retained.path.display()
            )
        })?;
        let content_bytes = std::fs::read(&retained.path).with_context(|| {
            format!(
                "Failed to read retained conflict file content: {}",
                retained.path.display()
            )
        })?;

        upsert_entries.push(UpsertSyncEntryInput {
            entry_id: retained.entry.entry_id.clone(),
            parent_entry_id: retained.entry.parent_entry_id.clone(),
            name: retained.entry.name.clone(),
            kind: retained.entry.kind.clone(),
            local_path: relative_workspace_path(workspace_root, &retained.path)?,
            last_known_size: i64::try_from(metadata.len()).ok(),
            last_known_mtime_ns: modified_time_ns(&metadata),
            last_known_content_hash: Some(blake3::hash(&content_bytes).to_hex().to_string()),
            last_synced_blob_id: None,
            last_synced_content_hash: None,
            sync_state: SYNC_STATE_CONFLICTED.to_string(),
        });
    }

    Ok(PreparedApplyState {
        persist_input: PersistSyncStateInput {
            sync_vault_state: Some(SaveSyncVaultStateInput {
                remote_vault_id: Some(plan.remote_vault_id.clone()),
                last_synced_commit_id: Some(plan.last_synced_commit_id.clone()),
                current_key_version: plan.current_key_version,
                last_remote_head_seen: Some(plan.last_synced_commit_id.clone()),
                last_scan_at: previous_vault_state.and_then(|state| state.last_scan_at),
            }),
            upsert_entries,
            deleted_entry_ids,
            conflicts: decisions.conflicts.clone(),
            replace_exclusion_events: Some(Vec::new()),
            exclusion_events_limit: 100,
        },
        entries_deleted,
    })
}
