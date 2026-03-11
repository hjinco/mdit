use std::collections::{HashMap, HashSet};

use uuid::Uuid;

use crate::{
    constants::{ENTRY_KIND_DIR, ENTRY_KIND_FILE, SYNC_STATE_PENDING},
    store::UpsertSyncEntryInput,
    types::SyncEntryRecord,
};

use super::walker::ObservedNode;

#[derive(Debug, Clone)]
struct ExistingEntryIndex<'a> {
    by_local_path: HashMap<&'a str, &'a SyncEntryRecord>,
    file_candidates_by_content_hash: HashMap<&'a str, Vec<&'a SyncEntryRecord>>,
    dir_candidates_by_name: HashMap<&'a str, Vec<&'a SyncEntryRecord>>,
}

#[derive(Debug, Default)]
struct MatchTracker {
    matched_entry_ids: HashSet<String>,
}

#[derive(Debug, Default)]
pub(crate) struct ReconciledScan {
    pub(crate) entries: Vec<UpsertSyncEntryInput>,
    pub(crate) retained_entry_ids: HashSet<String>,
}

pub(crate) fn reconcile_scan(
    existing_entries: &[SyncEntryRecord],
    observed_nodes: Vec<ObservedNode>,
) -> ReconciledScan {
    let existing_index = ExistingEntryIndex {
        by_local_path: existing_entries
            .iter()
            .map(|entry| (entry.local_path.as_str(), entry))
            .collect(),
        file_candidates_by_content_hash: build_file_candidate_index(existing_entries),
        dir_candidates_by_name: build_dir_candidate_index(existing_entries),
    };
    let mut match_tracker = MatchTracker::default();
    let mut retained_entry_ids = HashSet::new();
    let mut entries = Vec::with_capacity(observed_nodes.len());
    let mut entry_ids_by_local_path = HashMap::new();

    for node in observed_nodes {
        let parent_entry_id = node
            .parent_local_path
            .as_deref()
            .and_then(|path| entry_ids_by_local_path.get(path).cloned());
        let existing = match node.kind {
            ENTRY_KIND_DIR => match_existing_dir(
                &existing_index,
                &mut match_tracker,
                &node.local_path,
                &node.name,
                parent_entry_id.as_deref(),
            ),
            ENTRY_KIND_FILE => match_existing_file(
                &existing_index,
                &mut match_tracker,
                &node.local_path,
                &node.name,
                parent_entry_id.as_deref(),
                node.last_known_size,
                node.last_known_content_hash.as_deref(),
            ),
            _ => None,
        };

        let entry_id = existing
            .map(|entry| entry.entry_id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        retained_entry_ids.insert(entry_id.clone());
        if node.kind == ENTRY_KIND_DIR {
            entry_ids_by_local_path.insert(node.local_path.clone(), entry_id.clone());
        }

        let sync_state = match node.kind {
            ENTRY_KIND_DIR => existing
                .map(|entry| entry.sync_state.clone())
                .unwrap_or_else(|| SYNC_STATE_PENDING.to_string()),
            ENTRY_KIND_FILE => select_file_sync_state(existing, &node, parent_entry_id.as_deref()),
            _ => SYNC_STATE_PENDING.to_string(),
        };

        entries.push(UpsertSyncEntryInput {
            entry_id,
            parent_entry_id,
            name: node.name,
            kind: node.kind.to_string(),
            local_path: node.local_path,
            last_known_size: node.last_known_size,
            last_known_mtime_ns: node.last_known_mtime_ns,
            last_known_content_hash: node.last_known_content_hash,
            last_synced_blob_id: existing.and_then(|entry| entry.last_synced_blob_id.clone()),
            last_synced_content_hash: existing
                .and_then(|entry| entry.last_synced_content_hash.clone()),
            sync_state,
        });
    }

    ReconciledScan {
        entries,
        retained_entry_ids,
    }
}

fn select_file_sync_state(
    existing: Option<&SyncEntryRecord>,
    node: &ObservedNode,
    parent_entry_id: Option<&str>,
) -> String {
    let has_changed = existing.is_none_or(|entry| {
        entry.name != node.name
            || entry.parent_entry_id.as_deref() != parent_entry_id
            || entry.kind != ENTRY_KIND_FILE
            || entry.last_known_size != node.last_known_size
            || entry.last_known_content_hash.as_deref() != node.last_known_content_hash.as_deref()
    });

    if has_changed {
        SYNC_STATE_PENDING.to_string()
    } else {
        existing
            .map(|entry| entry.sync_state.clone())
            .unwrap_or_else(|| SYNC_STATE_PENDING.to_string())
    }
}

fn build_file_candidate_index<'a>(
    entries: &'a [SyncEntryRecord],
) -> HashMap<&'a str, Vec<&'a SyncEntryRecord>> {
    let mut index = HashMap::new();
    for entry in entries {
        if entry.kind != ENTRY_KIND_FILE {
            continue;
        }

        let Some(content_hash) = entry.last_known_content_hash.as_deref() else {
            continue;
        };
        index
            .entry(content_hash)
            .or_insert_with(Vec::new)
            .push(entry);
    }
    index
}

fn build_dir_candidate_index<'a>(
    entries: &'a [SyncEntryRecord],
) -> HashMap<&'a str, Vec<&'a SyncEntryRecord>> {
    let mut index = HashMap::new();
    for entry in entries {
        if entry.kind != ENTRY_KIND_DIR {
            continue;
        }

        index
            .entry(entry.name.as_str())
            .or_insert_with(Vec::new)
            .push(entry);
    }
    index
}

fn match_existing_dir<'a>(
    existing_index: &'a ExistingEntryIndex<'a>,
    match_tracker: &mut MatchTracker,
    local_path: &str,
    name: &str,
    parent_entry_id: Option<&str>,
) -> Option<&'a SyncEntryRecord> {
    if let Some(entry) = claim_exact_path_match(existing_index, match_tracker, local_path) {
        return Some(entry);
    }

    let candidates = existing_index.dir_candidates_by_name.get(name)?;
    let ranked = pick_unique_candidate(
        candidates,
        match_tracker,
        |entry| entry.parent_entry_id.as_deref() == parent_entry_id,
        |_| true,
    )?;
    claim_entry(match_tracker, ranked)
}

fn match_existing_file<'a>(
    existing_index: &'a ExistingEntryIndex<'a>,
    match_tracker: &mut MatchTracker,
    local_path: &str,
    name: &str,
    parent_entry_id: Option<&str>,
    size: Option<i64>,
    content_hash: Option<&str>,
) -> Option<&'a SyncEntryRecord> {
    if let Some(entry) = claim_exact_path_match(existing_index, match_tracker, local_path) {
        return Some(entry);
    }

    let candidates = existing_index
        .file_candidates_by_content_hash
        .get(content_hash?)?;

    let ranked = pick_unique_candidate(
        candidates,
        match_tracker,
        |entry| {
            entry.last_known_size == size
                && entry.name == name
                && entry.parent_entry_id.as_deref() == parent_entry_id
        },
        |entry| entry.last_known_size == size && entry.name == name,
    )
    .or_else(|| {
        pick_unique_candidate(
            candidates,
            match_tracker,
            |entry| {
                entry.last_known_size == size && entry.parent_entry_id.as_deref() == parent_entry_id
            },
            |entry| entry.last_known_size == size,
        )
    })?;

    claim_entry(match_tracker, ranked)
}

fn claim_exact_path_match<'a>(
    existing_index: &ExistingEntryIndex<'a>,
    match_tracker: &mut MatchTracker,
    local_path: &str,
) -> Option<&'a SyncEntryRecord> {
    let entry = existing_index.by_local_path.get(local_path).copied()?;
    claim_entry(match_tracker, entry)
}

fn claim_entry<'a>(
    match_tracker: &mut MatchTracker,
    entry: &'a SyncEntryRecord,
) -> Option<&'a SyncEntryRecord> {
    if !match_tracker
        .matched_entry_ids
        .insert(entry.entry_id.clone())
    {
        return None;
    }

    Some(entry)
}

fn pick_unique_candidate<'a, FPrimary, FFallback>(
    candidates: &'a [&'a SyncEntryRecord],
    match_tracker: &MatchTracker,
    primary_filter: FPrimary,
    fallback_filter: FFallback,
) -> Option<&'a SyncEntryRecord>
where
    FPrimary: Fn(&SyncEntryRecord) -> bool,
    FFallback: Fn(&SyncEntryRecord) -> bool,
{
    let primary_matches = candidates
        .iter()
        .copied()
        .filter(|entry| {
            !match_tracker
                .matched_entry_ids
                .contains(entry.entry_id.as_str())
                && primary_filter(entry)
        })
        .collect::<Vec<_>>();
    if primary_matches.len() == 1 {
        return primary_matches.into_iter().next();
    }

    let fallback_matches = candidates
        .iter()
        .copied()
        .filter(|entry| {
            !match_tracker
                .matched_entry_ids
                .contains(entry.entry_id.as_str())
                && fallback_filter(entry)
        })
        .collect::<Vec<_>>();
    if fallback_matches.len() == 1 {
        return fallback_matches.into_iter().next();
    }

    None
}
