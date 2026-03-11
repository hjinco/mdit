use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use base64::Engine;
use diff_match_patch_rs::{Compat, DiffMatchPatch, Ops};

use crate::{
    constants::{ENTRY_KIND_FILE, SYNC_STATE_CONFLICTED, SYNC_STATE_PENDING, SYNC_STATE_SYNCED},
    store::RecordSyncConflictInput,
    types::{ApplyRemoteSyncFileInput, LocalSyncManifestEntry, SyncEntryRecord},
    util::{relative_workspace_path, workspace_absolute_path},
};

use super::validator::ApplyPlan;

#[derive(Debug)]
pub(crate) struct ApplyDecisions {
    pub(crate) file_outcomes: HashMap<String, FileApplyOutcome>,
    pub(crate) retained_deleted_entries: Vec<RetainedDeletedEntry>,
    pub(crate) protected_paths: HashSet<PathBuf>,
    pub(crate) conflicts: Vec<RecordSyncConflictInput>,
}

#[derive(Debug)]
pub(crate) struct FileApplyOutcome {
    pub(crate) path: PathBuf,
    pub(crate) action: FileApplyAction,
    pub(crate) sync_state: String,
}

#[derive(Debug)]
pub(crate) enum FileApplyAction {
    WriteRemotePayload,
    WriteBytes(Vec<u8>),
    KeepLocal,
}

#[derive(Debug)]
pub(crate) struct RetainedDeletedEntry {
    pub(crate) entry: SyncEntryRecord,
    pub(crate) path: PathBuf,
}

#[derive(Debug)]
struct TextEdit {
    start: usize,
    end: usize,
    inserted: Vec<char>,
}

#[derive(Debug)]
enum MergeOutcome {
    Clean(String),
    Conflict(String),
}

pub(crate) fn plan_apply_decisions(
    workspace_root: &Path,
    existing_entries: &[SyncEntryRecord],
    plan: &ApplyPlan,
) -> Result<ApplyDecisions> {
    let existing_entries_by_id = existing_entries
        .iter()
        .map(|entry| (entry.entry_id.as_str(), entry))
        .collect::<HashMap<_, _>>();
    let mut file_outcomes = HashMap::new();
    let mut retained_deleted_entries = Vec::new();
    let mut protected_paths = HashSet::new();
    let mut conflicts = Vec::new();

    for entry in &plan.manifest.entries {
        let LocalSyncManifestEntry::File {
            entry_id,
            content_hash,
            ..
        } = entry
        else {
            continue;
        };

        let payload = plan.file_payload(entry_id)?;
        let manifest_path = plan.absolute_path(workspace_root, entry_id, ENTRY_KIND_FILE)?;
        let existing = existing_entries_by_id.get(entry_id.as_str()).copied();
        let outcome = plan_file_outcome(
            workspace_root,
            existing,
            &manifest_path,
            content_hash,
            payload,
            plan.manifest.base_commit_id.as_deref(),
            &plan.last_synced_commit_id,
            &mut conflicts,
            &mut protected_paths,
        )?;
        file_outcomes.insert(entry_id.clone(), outcome);
    }

    for entry in existing_entries {
        if plan.manifest_entry_ids.contains(entry.entry_id.as_str())
            || entry.kind != ENTRY_KIND_FILE
        {
            continue;
        }

        let absolute_path = workspace_absolute_path(workspace_root, &entry.local_path)?;
        if !absolute_path.is_file() {
            continue;
        }

        let keep_local = local_path_is_newer(entry, &absolute_path)?;
        if keep_local {
            conflicts.push(RecordSyncConflictInput {
                entry_id: Some(entry.entry_id.clone()),
                original_path: relative_workspace_path(workspace_root, &absolute_path)?,
                conflict_path: relative_workspace_path(workspace_root, &absolute_path)?,
                base_commit_id: plan.manifest.base_commit_id.clone(),
                remote_commit_id: plan.last_synced_commit_id.clone(),
            });
            protected_paths.insert(absolute_path.clone());
            retained_deleted_entries.push(RetainedDeletedEntry {
                entry: entry.clone(),
                path: absolute_path,
            });
        }
    }

    Ok(ApplyDecisions {
        file_outcomes,
        retained_deleted_entries,
        protected_paths,
        conflicts,
    })
}

fn plan_file_outcome(
    workspace_root: &Path,
    existing_entry: Option<&SyncEntryRecord>,
    manifest_path: &Path,
    remote_content_hash: &str,
    payload: &ApplyRemoteSyncFileInput,
    base_commit_id: Option<&str>,
    remote_commit_id: &str,
    conflicts: &mut Vec<RecordSyncConflictInput>,
    protected_paths: &mut HashSet<PathBuf>,
) -> Result<FileApplyOutcome> {
    let Some(existing_entry) = existing_entry else {
        return Ok(FileApplyOutcome {
            path: manifest_path.to_path_buf(),
            action: FileApplyAction::WriteRemotePayload,
            sync_state: SYNC_STATE_SYNCED.to_string(),
        });
    };

    let existing_path = workspace_absolute_path(workspace_root, &existing_entry.local_path)?;
    if existing_entry.kind != ENTRY_KIND_FILE || !existing_path.is_file() {
        return Ok(FileApplyOutcome {
            path: manifest_path.to_path_buf(),
            action: FileApplyAction::WriteRemotePayload,
            sync_state: SYNC_STATE_SYNCED.to_string(),
        });
    }

    let Some(last_synced_content_hash) = existing_entry.last_synced_content_hash.as_deref() else {
        return Ok(FileApplyOutcome {
            path: manifest_path.to_path_buf(),
            action: FileApplyAction::WriteRemotePayload,
            sync_state: SYNC_STATE_SYNCED.to_string(),
        });
    };

    let local_bytes = fs::read(&existing_path)
        .with_context(|| format!("Failed to read local file {}", existing_path.display()))?;
    let local_content_hash = blake3::hash(&local_bytes).to_hex().to_string();

    if local_content_hash == remote_content_hash {
        return Ok(FileApplyOutcome {
            path: manifest_path.to_path_buf(),
            action: if existing_path == manifest_path {
                FileApplyAction::KeepLocal
            } else {
                FileApplyAction::WriteBytes(local_bytes)
            },
            sync_state: SYNC_STATE_SYNCED.to_string(),
        });
    }

    if remote_content_hash == last_synced_content_hash {
        protected_paths.insert(existing_path.clone());
        return Ok(FileApplyOutcome {
            path: existing_path,
            action: FileApplyAction::KeepLocal,
            sync_state: if local_content_hash == last_synced_content_hash {
                SYNC_STATE_SYNCED.to_string()
            } else {
                SYNC_STATE_PENDING.to_string()
            },
        });
    }

    if local_content_hash == last_synced_content_hash {
        return Ok(FileApplyOutcome {
            path: manifest_path.to_path_buf(),
            action: FileApplyAction::WriteRemotePayload,
            sync_state: SYNC_STATE_SYNCED.to_string(),
        });
    }

    if is_markdown_path(manifest_path) {
        if let Some(merge_outcome) = maybe_merge_markdown(payload, &local_bytes)? {
            let merged = match merge_outcome {
                MergeOutcome::Clean(merged) => {
                    return Ok(FileApplyOutcome {
                        path: manifest_path.to_path_buf(),
                        action: FileApplyAction::WriteBytes(merged.into_bytes()),
                        sync_state: SYNC_STATE_SYNCED.to_string(),
                    });
                }
                MergeOutcome::Conflict(merged) => merged,
            };

            conflicts.push(RecordSyncConflictInput {
                entry_id: Some(existing_entry.entry_id.clone()),
                original_path: relative_workspace_path(workspace_root, manifest_path)?,
                conflict_path: relative_workspace_path(workspace_root, manifest_path)?,
                base_commit_id: base_commit_id.map(ToOwned::to_owned),
                remote_commit_id: remote_commit_id.to_string(),
            });
            return Ok(FileApplyOutcome {
                path: manifest_path.to_path_buf(),
                action: FileApplyAction::WriteBytes(merged.into_bytes()),
                sync_state: SYNC_STATE_CONFLICTED.to_string(),
            });
        }
    }

    let local_newer = local_file_is_newer(&existing_path, payload.modified_at)?;
    if local_newer {
        conflicts.push(RecordSyncConflictInput {
            entry_id: Some(existing_entry.entry_id.clone()),
            original_path: relative_workspace_path(workspace_root, &existing_path)?,
            conflict_path: relative_workspace_path(workspace_root, &existing_path)?,
            base_commit_id: base_commit_id.map(ToOwned::to_owned),
            remote_commit_id: remote_commit_id.to_string(),
        });
        protected_paths.insert(existing_path.clone());
        return Ok(FileApplyOutcome {
            path: existing_path,
            action: FileApplyAction::KeepLocal,
            sync_state: SYNC_STATE_CONFLICTED.to_string(),
        });
    }

    Ok(FileApplyOutcome {
        path: manifest_path.to_path_buf(),
        action: FileApplyAction::WriteRemotePayload,
        sync_state: SYNC_STATE_SYNCED.to_string(),
    })
}

fn maybe_merge_markdown(
    payload: &ApplyRemoteSyncFileInput,
    local_bytes: &[u8],
) -> Result<Option<MergeOutcome>> {
    let Some(base_plaintext_base64) = payload.base_plaintext_base64.as_deref() else {
        return Ok(None);
    };

    let base_bytes = base64::engine::general_purpose::STANDARD
        .decode(base_plaintext_base64)
        .context("Failed to decode markdown merge base payload")?;
    let remote_bytes = base64::engine::general_purpose::STANDARD
        .decode(&payload.plaintext_base64)
        .context("Failed to decode markdown merge remote payload")?;

    let Ok(base_text) = String::from_utf8(base_bytes) else {
        return Ok(None);
    };
    let Ok(local_text) = String::from_utf8(local_bytes.to_vec()) else {
        return Ok(None);
    };
    let Ok(remote_text) = String::from_utf8(remote_bytes) else {
        return Ok(None);
    };

    Ok(Some(merge_markdown_text(
        &base_text,
        &local_text,
        &remote_text,
    )?))
}

fn merge_markdown_text(base: &str, local: &str, remote: &str) -> Result<MergeOutcome> {
    let dmp = DiffMatchPatch::new();
    let local_diffs = dmp
        .diff_main::<Compat>(base, local)
        .map_err(|error| anyhow::anyhow!("Failed to diff local markdown changes: {error:?}"))?;
    let remote_diffs = dmp
        .diff_main::<Compat>(base, remote)
        .map_err(|error| anyhow::anyhow!("Failed to diff remote markdown changes: {error:?}"))?;

    let local_edits = diffs_to_edits(&local_diffs);
    let remote_edits = diffs_to_edits(&remote_diffs);
    let base_chars = base.chars().collect::<Vec<_>>();

    let mut merged = String::new();
    let mut has_conflict = false;
    let mut cursor = 0usize;
    let mut local_index = 0usize;
    let mut remote_index = 0usize;

    while local_index < local_edits.len() || remote_index < remote_edits.len() {
        match (local_edits.get(local_index), remote_edits.get(remote_index)) {
            (Some(local_edit), Some(remote_edit)) if edits_equal(local_edit, remote_edit) => {
                append_chars(&base_chars, cursor, local_edit.start, &mut merged);
                append_inserted(&local_edit.inserted, &mut merged);
                cursor = local_edit.end;
                local_index += 1;
                remote_index += 1;
            }
            (Some(local_edit), Some(remote_edit))
                if edits_do_not_overlap(local_edit, remote_edit) =>
            {
                if local_edit.start <= remote_edit.start {
                    append_chars(&base_chars, cursor, local_edit.start, &mut merged);
                    append_inserted(&local_edit.inserted, &mut merged);
                    cursor = local_edit.end;
                    local_index += 1;
                } else {
                    append_chars(&base_chars, cursor, remote_edit.start, &mut merged);
                    append_inserted(&remote_edit.inserted, &mut merged);
                    cursor = remote_edit.end;
                    remote_index += 1;
                }
            }
            (Some(_), Some(_)) => {
                has_conflict = true;
                let (cluster_start, cluster_end, next_local_index, next_remote_index) =
                    conflict_cluster_bounds(&local_edits, local_index, &remote_edits, remote_index);
                append_chars(&base_chars, cursor, cluster_start, &mut merged);

                let local_segment = render_segment(
                    &base_chars,
                    cluster_start,
                    cluster_end,
                    &local_edits[local_index..next_local_index],
                );
                let remote_segment = render_segment(
                    &base_chars,
                    cluster_start,
                    cluster_end,
                    &remote_edits[remote_index..next_remote_index],
                );
                merged.push_str(&conflict_marker(&local_segment, &remote_segment));

                cursor = cluster_end;
                local_index = next_local_index;
                remote_index = next_remote_index;
            }
            (Some(local_edit), None) => {
                append_chars(&base_chars, cursor, local_edit.start, &mut merged);
                append_inserted(&local_edit.inserted, &mut merged);
                cursor = local_edit.end;
                local_index += 1;
            }
            (None, Some(remote_edit)) => {
                append_chars(&base_chars, cursor, remote_edit.start, &mut merged);
                append_inserted(&remote_edit.inserted, &mut merged);
                cursor = remote_edit.end;
                remote_index += 1;
            }
            (None, None) => break,
        }
    }

    append_chars(&base_chars, cursor, base_chars.len(), &mut merged);

    if has_conflict {
        Ok(MergeOutcome::Conflict(merged))
    } else {
        Ok(MergeOutcome::Clean(merged))
    }
}

fn diffs_to_edits(diffs: &[diff_match_patch_rs::dmp::Diff<char>]) -> Vec<TextEdit> {
    let mut edits = Vec::new();
    let mut position = 0usize;
    let mut current: Option<TextEdit> = None;

    for diff in diffs {
        match diff.op() {
            Ops::Equal => {
                if let Some(edit) = current.take() {
                    edits.push(edit);
                }
                position += diff.data().len();
            }
            Ops::Delete => {
                let edit = current.get_or_insert_with(|| TextEdit {
                    start: position,
                    end: position,
                    inserted: Vec::new(),
                });
                edit.end += diff.data().len();
                position += diff.data().len();
            }
            Ops::Insert => {
                let edit = current.get_or_insert_with(|| TextEdit {
                    start: position,
                    end: position,
                    inserted: Vec::new(),
                });
                edit.inserted.extend_from_slice(diff.data());
            }
        }
    }

    if let Some(edit) = current {
        edits.push(edit);
    }

    edits
}

fn edits_equal(left: &TextEdit, right: &TextEdit) -> bool {
    left.start == right.start && left.end == right.end && left.inserted == right.inserted
}

fn edits_do_not_overlap(left: &TextEdit, right: &TextEdit) -> bool {
    if left.start == right.start && left.start == left.end && right.start == right.end {
        return false;
    }

    left.end <= right.start || right.end <= left.start
}

fn conflict_cluster_bounds(
    local_edits: &[TextEdit],
    local_index: usize,
    remote_edits: &[TextEdit],
    remote_index: usize,
) -> (usize, usize, usize, usize) {
    let mut cluster_start = local_edits[local_index]
        .start
        .min(remote_edits[remote_index].start);
    let mut cluster_end = local_edits[local_index]
        .end
        .max(remote_edits[remote_index].end);
    let mut next_local = local_index;
    let mut next_remote = remote_index;
    let mut changed = true;

    while changed {
        changed = false;

        while let Some(edit) = local_edits.get(next_local) {
            if edit.start > cluster_end {
                break;
            }
            cluster_start = cluster_start.min(edit.start);
            cluster_end = cluster_end.max(edit.end);
            next_local += 1;
            changed = true;
        }

        while let Some(edit) = remote_edits.get(next_remote) {
            if edit.start > cluster_end {
                break;
            }
            cluster_start = cluster_start.min(edit.start);
            cluster_end = cluster_end.max(edit.end);
            next_remote += 1;
            changed = true;
        }
    }

    (cluster_start, cluster_end, next_local, next_remote)
}

fn render_segment(base_chars: &[char], start: usize, end: usize, edits: &[TextEdit]) -> String {
    let mut rendered = String::new();
    let mut cursor = start;

    for edit in edits {
        append_chars(base_chars, cursor, edit.start.min(end), &mut rendered);
        append_inserted(&edit.inserted, &mut rendered);
        cursor = edit.end.max(cursor);
    }

    append_chars(base_chars, cursor, end, &mut rendered);
    rendered
}

fn append_chars(base_chars: &[char], start: usize, end: usize, output: &mut String) {
    for character in &base_chars[start..end] {
        output.push(*character);
    }
}

fn append_inserted(inserted: &[char], output: &mut String) {
    for character in inserted {
        output.push(*character);
    }
}

fn conflict_marker(local: &str, remote: &str) -> String {
    format!("<<<<<<< LOCAL\n{local}\n=======\n{remote}\n>>>>>>> REMOTE\n")
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
}

fn local_file_is_newer(path: &Path, remote_modified_at: i64) -> Result<bool> {
    let metadata = fs::metadata(path)
        .with_context(|| format!("Failed to read local metadata {}", path.display()))?;
    let local_mtime = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .and_then(|duration| i64::try_from(duration.as_nanos()).ok())
        .unwrap_or_default();
    Ok(local_mtime > remote_modified_at)
}

fn local_path_is_newer(existing_entry: &SyncEntryRecord, path: &Path) -> Result<bool> {
    let metadata = fs::metadata(path)
        .with_context(|| format!("Failed to read local metadata {}", path.display()))?;
    let local_mtime = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .and_then(|duration| i64::try_from(duration.as_nanos()).ok())
        .unwrap_or_default();
    Ok(local_mtime > existing_entry.last_known_mtime_ns.unwrap_or_default())
}
