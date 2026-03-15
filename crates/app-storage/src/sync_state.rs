use std::path::Path;

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::vault::{ensure_workspace_exists, open_vault_connection};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncVaultState {
    pub vault_id: i64,
    pub remote_vault_id: Option<String>,
    pub last_synced_commit_id: Option<String>,
    pub current_key_version: i64,
    pub last_remote_head_seen: Option<String>,
    pub last_scan_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncEntryRecord {
    pub id: i64,
    pub vault_id: i64,
    pub entry_id: String,
    pub parent_entry_id: Option<String>,
    pub name: String,
    pub kind: String,
    pub local_path: String,
    pub last_known_size: Option<i64>,
    pub last_known_mtime_ns: Option<i64>,
    pub last_known_content_hash: Option<String>,
    pub last_synced_blob_id: Option<String>,
    pub last_synced_content_hash: Option<String>,
    pub sync_state: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflictRecord {
    pub id: i64,
    pub vault_id: i64,
    pub entry_id: Option<String>,
    pub original_path: String,
    pub conflict_path: String,
    pub base_commit_id: Option<String>,
    pub remote_commit_id: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncExclusionEventRecord {
    pub id: i64,
    pub vault_id: i64,
    pub local_path: String,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SaveSyncVaultStateInput {
    pub remote_vault_id: Option<String>,
    pub last_synced_commit_id: Option<String>,
    pub current_key_version: i64,
    pub last_remote_head_seen: Option<String>,
    pub last_scan_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpsertSyncEntryInput {
    pub entry_id: String,
    pub parent_entry_id: Option<String>,
    pub name: String,
    pub kind: String,
    pub local_path: String,
    pub last_known_size: Option<i64>,
    pub last_known_mtime_ns: Option<i64>,
    pub last_known_content_hash: Option<String>,
    pub last_synced_blob_id: Option<String>,
    pub last_synced_content_hash: Option<String>,
    pub sync_state: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordSyncConflictInput {
    pub entry_id: Option<String>,
    pub original_path: String,
    pub conflict_path: String,
    pub base_commit_id: Option<String>,
    pub remote_commit_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordSyncExclusionEventInput {
    pub local_path: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersistSyncStateInput {
    pub sync_vault_state: Option<SaveSyncVaultStateInput>,
    pub upsert_entries: Vec<UpsertSyncEntryInput>,
    pub deleted_entry_ids: Vec<String>,
    pub conflicts: Vec<RecordSyncConflictInput>,
    pub replace_exclusion_events: Option<Vec<RecordSyncExclusionEventInput>>,
    pub exclusion_events_limit: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersistSyncStateResult {
    pub sync_vault_state: Option<SyncVaultState>,
    pub entries: Vec<SyncEntryRecord>,
    pub exclusion_events: Vec<SyncExclusionEventRecord>,
}

fn map_sync_vault_state_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncVaultState> {
    Ok(SyncVaultState {
        vault_id: row.get(0)?,
        remote_vault_id: row.get(1)?,
        last_synced_commit_id: row.get(2)?,
        current_key_version: row.get(3)?,
        last_remote_head_seen: row.get(4)?,
        last_scan_at: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn map_sync_entry_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncEntryRecord> {
    Ok(SyncEntryRecord {
        id: row.get(0)?,
        vault_id: row.get(1)?,
        entry_id: row.get(2)?,
        parent_entry_id: row.get(3)?,
        name: row.get(4)?,
        kind: row.get(5)?,
        local_path: row.get(6)?,
        last_known_size: row.get(7)?,
        last_known_mtime_ns: row.get(8)?,
        last_known_content_hash: row.get(9)?,
        last_synced_blob_id: row.get(10)?,
        last_synced_content_hash: row.get(11)?,
        sync_state: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn map_sync_conflict_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncConflictRecord> {
    Ok(SyncConflictRecord {
        id: row.get(0)?,
        vault_id: row.get(1)?,
        entry_id: row.get(2)?,
        original_path: row.get(3)?,
        conflict_path: row.get(4)?,
        base_commit_id: row.get(5)?,
        remote_commit_id: row.get(6)?,
        status: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn map_sync_exclusion_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncExclusionEventRecord> {
    Ok(SyncExclusionEventRecord {
        id: row.get(0)?,
        vault_id: row.get(1)?,
        local_path: row.get(2)?,
        reason: row.get(3)?,
        created_at: row.get(4)?,
    })
}

fn ensure_sync_vault_row(conn: &Connection, workspace_root: &Path) -> Result<i64> {
    let vault_id = ensure_workspace_exists(conn, workspace_root)?;

    conn.execute(
        "INSERT OR IGNORE INTO sync_vault (vault_id) VALUES (?1)",
        params![vault_id],
    )
    .context("Failed to ensure sync_vault row exists")?;

    Ok(vault_id)
}

fn get_sync_vault_state_with_conn(
    conn: &Connection,
    workspace_root: &Path,
) -> Result<Option<SyncVaultState>> {
    let vault_id = ensure_workspace_exists(conn, workspace_root)?;

    conn.query_row(
        "SELECT vault_id, remote_vault_id, last_synced_commit_id, current_key_version,
                last_remote_head_seen, last_scan_at, created_at, updated_at
         FROM sync_vault WHERE vault_id = ?1",
        params![vault_id],
        map_sync_vault_state_row,
    )
    .optional()
    .context("Failed to load sync vault state")
}

fn save_sync_vault_state_with_conn(
    conn: &Connection,
    workspace_root: &Path,
    input: &SaveSyncVaultStateInput,
) -> Result<SyncVaultState> {
    let vault_id = ensure_sync_vault_row(conn, workspace_root)?;

    conn.execute(
        "INSERT INTO sync_vault (
            vault_id,
            remote_vault_id,
            last_synced_commit_id,
            current_key_version,
            last_remote_head_seen,
            last_scan_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(vault_id) DO UPDATE SET
            remote_vault_id = excluded.remote_vault_id,
            last_synced_commit_id = excluded.last_synced_commit_id,
            current_key_version = excluded.current_key_version,
            last_remote_head_seen = excluded.last_remote_head_seen,
            last_scan_at = excluded.last_scan_at,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        params![
            vault_id,
            input.remote_vault_id,
            input.last_synced_commit_id,
            input.current_key_version,
            input.last_remote_head_seen,
            input.last_scan_at,
        ],
    )
    .context("Failed to save sync_vault state")?;

    conn.query_row(
        "SELECT vault_id, remote_vault_id, last_synced_commit_id, current_key_version,
                last_remote_head_seen, last_scan_at, created_at, updated_at
         FROM sync_vault WHERE vault_id = ?1",
        params![vault_id],
        map_sync_vault_state_row,
    )
    .context("Failed to reload sync_vault state after save")
}

fn list_sync_entries_with_conn(
    conn: &Connection,
    workspace_root: &Path,
) -> Result<Vec<SyncEntryRecord>> {
    let vault_id = ensure_sync_vault_row(conn, workspace_root)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, vault_id, entry_id, parent_entry_id, name, kind, local_path,
                    last_known_size, last_known_mtime_ns, last_known_content_hash,
                    last_synced_blob_id, last_synced_content_hash, sync_state,
                    created_at, updated_at
             FROM sync_entry
             WHERE vault_id = ?1
             ORDER BY local_path ASC, id ASC",
        )
        .context("Failed to prepare sync entry list query")?;

    let entries = stmt
        .query_map(params![vault_id], map_sync_entry_row)
        .context("Failed to load sync entries")?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to read sync entry rows")?;

    Ok(entries)
}

fn upsert_sync_entry_with_conn(
    conn: &Connection,
    workspace_root: &Path,
    input: &UpsertSyncEntryInput,
) -> Result<SyncEntryRecord> {
    let vault_id = ensure_sync_vault_row(conn, workspace_root)?;

    conn.execute(
        "INSERT INTO sync_entry (
            vault_id,
            entry_id,
            parent_entry_id,
            name,
            kind,
            local_path,
            last_known_size,
            last_known_mtime_ns,
            last_known_content_hash,
            last_synced_blob_id,
            last_synced_content_hash,
            sync_state
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(vault_id, entry_id) DO UPDATE SET
            parent_entry_id = excluded.parent_entry_id,
            name = excluded.name,
            kind = excluded.kind,
            local_path = excluded.local_path,
            last_known_size = excluded.last_known_size,
            last_known_mtime_ns = excluded.last_known_mtime_ns,
            last_known_content_hash = excluded.last_known_content_hash,
            last_synced_blob_id = excluded.last_synced_blob_id,
            last_synced_content_hash = excluded.last_synced_content_hash,
            sync_state = excluded.sync_state,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        params![
            vault_id,
            input.entry_id,
            input.parent_entry_id,
            input.name,
            input.kind,
            input.local_path,
            input.last_known_size,
            input.last_known_mtime_ns,
            input.last_known_content_hash,
            input.last_synced_blob_id,
            input.last_synced_content_hash,
            input.sync_state,
        ],
    )
    .context("Failed to upsert sync entry")?;

    conn.query_row(
        "SELECT id, vault_id, entry_id, parent_entry_id, name, kind, local_path,
                last_known_size, last_known_mtime_ns, last_known_content_hash,
                last_synced_blob_id, last_synced_content_hash, sync_state,
                created_at, updated_at
         FROM sync_entry
         WHERE vault_id = ?1 AND entry_id = ?2",
        params![vault_id, input.entry_id],
        map_sync_entry_row,
    )
    .context("Failed to reload sync entry after upsert")
}

fn delete_sync_entry_with_conn(
    conn: &Connection,
    workspace_root: &Path,
    entry_id: &str,
) -> Result<()> {
    let vault_id = ensure_sync_vault_row(conn, workspace_root)?;

    conn.execute(
        "DELETE FROM sync_entry WHERE vault_id = ?1 AND entry_id = ?2",
        params![vault_id, entry_id],
    )
    .context("Failed to delete sync entry")?;

    Ok(())
}

fn record_sync_conflict_with_conn(
    conn: &Connection,
    workspace_root: &Path,
    input: &RecordSyncConflictInput,
) -> Result<SyncConflictRecord> {
    let vault_id = ensure_sync_vault_row(conn, workspace_root)?;

    conn.execute(
        "INSERT INTO sync_conflict (
            vault_id,
            entry_id,
            original_path,
            conflict_path,
            base_commit_id,
            remote_commit_id
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            vault_id,
            input.entry_id,
            input.original_path,
            input.conflict_path,
            input.base_commit_id,
            input.remote_commit_id,
        ],
    )
    .context("Failed to record sync conflict")?;

    let conflict_id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, vault_id, entry_id, original_path, conflict_path,
                base_commit_id, remote_commit_id, status, created_at
         FROM sync_conflict
         WHERE id = ?1",
        params![conflict_id],
        map_sync_conflict_row,
    )
    .context("Failed to reload sync conflict after insert")
}

fn record_sync_exclusion_event_with_conn(
    conn: &Connection,
    workspace_root: &Path,
    input: &RecordSyncExclusionEventInput,
) -> Result<SyncExclusionEventRecord> {
    let vault_id = ensure_sync_vault_row(conn, workspace_root)?;

    conn.execute(
        "INSERT INTO sync_exclusion_event (vault_id, local_path, reason)
         VALUES (?1, ?2, ?3)",
        params![vault_id, input.local_path, input.reason],
    )
    .context("Failed to record sync exclusion event")?;

    let event_id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, vault_id, local_path, reason, created_at
         FROM sync_exclusion_event
         WHERE id = ?1",
        params![event_id],
        map_sync_exclusion_row,
    )
    .context("Failed to reload sync exclusion event after insert")
}

fn list_sync_exclusion_events_with_conn(
    conn: &Connection,
    workspace_root: &Path,
    limit: usize,
) -> Result<Vec<SyncExclusionEventRecord>> {
    let vault_id = ensure_sync_vault_row(conn, workspace_root)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, vault_id, local_path, reason, created_at
             FROM sync_exclusion_event
             WHERE vault_id = ?1
             ORDER BY created_at DESC, id DESC
             LIMIT ?2",
        )
        .context("Failed to prepare sync exclusion list query")?;

    let exclusions = stmt
        .query_map(params![vault_id, limit as i64], map_sync_exclusion_row)
        .context("Failed to load sync exclusion events")?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to read sync exclusion rows")?;

    Ok(exclusions)
}

fn clear_sync_exclusion_events_with_conn(conn: &Connection, workspace_root: &Path) -> Result<()> {
    let vault_id = ensure_sync_vault_row(conn, workspace_root)?;

    conn.execute(
        "DELETE FROM sync_exclusion_event WHERE vault_id = ?1",
        params![vault_id],
    )
    .context("Failed to clear sync exclusion events")?;

    Ok(())
}

pub fn get_sync_vault_state(
    db_path: &Path,
    workspace_root: &Path,
) -> Result<Option<SyncVaultState>> {
    let conn = open_vault_connection(db_path)?;
    get_sync_vault_state_with_conn(&conn, workspace_root)
}

pub fn save_sync_vault_state(
    db_path: &Path,
    workspace_root: &Path,
    input: &SaveSyncVaultStateInput,
) -> Result<SyncVaultState> {
    let conn = open_vault_connection(db_path)?;
    let vault_id = ensure_sync_vault_row(&conn, workspace_root)?;

    conn.execute(
        "INSERT INTO sync_vault (
            vault_id,
            remote_vault_id,
            last_synced_commit_id,
            current_key_version,
            last_remote_head_seen,
            last_scan_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(vault_id) DO UPDATE SET
            remote_vault_id = excluded.remote_vault_id,
            last_synced_commit_id = excluded.last_synced_commit_id,
            current_key_version = excluded.current_key_version,
            last_remote_head_seen = excluded.last_remote_head_seen,
            last_scan_at = excluded.last_scan_at,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        params![
            vault_id,
            input.remote_vault_id,
            input.last_synced_commit_id,
            input.current_key_version,
            input.last_remote_head_seen,
            input.last_scan_at,
        ],
    )
    .context("Failed to save sync_vault state")?;

    conn.query_row(
        "SELECT vault_id, remote_vault_id, last_synced_commit_id, current_key_version,
                last_remote_head_seen, last_scan_at, created_at, updated_at
         FROM sync_vault WHERE vault_id = ?1",
        params![vault_id],
        map_sync_vault_state_row,
    )
    .context("Failed to reload sync_vault state after save")
}

pub fn touch_sync_vault_state(db_path: &Path, workspace_root: &Path) -> Result<SyncVaultState> {
    let conn = open_vault_connection(db_path)?;
    let vault_id = ensure_sync_vault_row(&conn, workspace_root)?;

    conn.query_row(
        "SELECT vault_id, remote_vault_id, last_synced_commit_id, current_key_version,
                last_remote_head_seen, last_scan_at, created_at, updated_at
         FROM sync_vault WHERE vault_id = ?1",
        params![vault_id],
        map_sync_vault_state_row,
    )
    .context("Failed to load sync_vault state after touch")
}

pub fn list_sync_entries(db_path: &Path, workspace_root: &Path) -> Result<Vec<SyncEntryRecord>> {
    let conn = open_vault_connection(db_path)?;
    let vault_id = ensure_sync_vault_row(&conn, workspace_root)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, vault_id, entry_id, parent_entry_id, name, kind, local_path,
                    last_known_size, last_known_mtime_ns, last_known_content_hash,
                    last_synced_blob_id, last_synced_content_hash, sync_state,
                    created_at, updated_at
             FROM sync_entry
             WHERE vault_id = ?1
             ORDER BY local_path ASC, id ASC",
        )
        .context("Failed to prepare sync entry list query")?;

    let entries = stmt
        .query_map(params![vault_id], map_sync_entry_row)
        .context("Failed to load sync entries")?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to read sync entry rows")?;

    Ok(entries)
}

pub fn get_sync_entry_by_local_path(
    db_path: &Path,
    workspace_root: &Path,
    local_path: &str,
) -> Result<Option<SyncEntryRecord>> {
    let conn = open_vault_connection(db_path)?;
    let vault_id = ensure_sync_vault_row(&conn, workspace_root)?;

    conn.query_row(
        "SELECT id, vault_id, entry_id, parent_entry_id, name, kind, local_path,
                last_known_size, last_known_mtime_ns, last_known_content_hash,
                last_synced_blob_id, last_synced_content_hash, sync_state,
                created_at, updated_at
         FROM sync_entry
         WHERE vault_id = ?1 AND local_path = ?2",
        params![vault_id, local_path],
        map_sync_entry_row,
    )
    .optional()
    .context("Failed to load sync entry by local_path")
}

pub fn upsert_sync_entry(
    db_path: &Path,
    workspace_root: &Path,
    input: &UpsertSyncEntryInput,
) -> Result<SyncEntryRecord> {
    let conn = open_vault_connection(db_path)?;
    let vault_id = ensure_sync_vault_row(&conn, workspace_root)?;

    conn.execute(
        "INSERT INTO sync_entry (
            vault_id,
            entry_id,
            parent_entry_id,
            name,
            kind,
            local_path,
            last_known_size,
            last_known_mtime_ns,
            last_known_content_hash,
            last_synced_blob_id,
            last_synced_content_hash,
            sync_state
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(vault_id, entry_id) DO UPDATE SET
            parent_entry_id = excluded.parent_entry_id,
            name = excluded.name,
            kind = excluded.kind,
            local_path = excluded.local_path,
            last_known_size = excluded.last_known_size,
            last_known_mtime_ns = excluded.last_known_mtime_ns,
            last_known_content_hash = excluded.last_known_content_hash,
            last_synced_blob_id = excluded.last_synced_blob_id,
            last_synced_content_hash = excluded.last_synced_content_hash,
            sync_state = excluded.sync_state,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        params![
            vault_id,
            input.entry_id,
            input.parent_entry_id,
            input.name,
            input.kind,
            input.local_path,
            input.last_known_size,
            input.last_known_mtime_ns,
            input.last_known_content_hash,
            input.last_synced_blob_id,
            input.last_synced_content_hash,
            input.sync_state,
        ],
    )
    .context("Failed to upsert sync entry")?;

    conn.query_row(
        "SELECT id, vault_id, entry_id, parent_entry_id, name, kind, local_path,
                last_known_size, last_known_mtime_ns, last_known_content_hash,
                last_synced_blob_id, last_synced_content_hash, sync_state,
                created_at, updated_at
         FROM sync_entry
         WHERE vault_id = ?1 AND entry_id = ?2",
        params![vault_id, input.entry_id],
        map_sync_entry_row,
    )
    .context("Failed to reload sync entry after upsert")
}

pub fn delete_sync_entry(db_path: &Path, workspace_root: &Path, entry_id: &str) -> Result<()> {
    let conn = open_vault_connection(db_path)?;
    let vault_id = ensure_sync_vault_row(&conn, workspace_root)?;

    conn.execute(
        "DELETE FROM sync_entry WHERE vault_id = ?1 AND entry_id = ?2",
        params![vault_id, entry_id],
    )
    .context("Failed to delete sync entry")?;

    Ok(())
}

pub fn record_sync_conflict(
    db_path: &Path,
    workspace_root: &Path,
    input: &RecordSyncConflictInput,
) -> Result<SyncConflictRecord> {
    let conn = open_vault_connection(db_path)?;
    let vault_id = ensure_sync_vault_row(&conn, workspace_root)?;

    conn.execute(
        "INSERT INTO sync_conflict (
            vault_id,
            entry_id,
            original_path,
            conflict_path,
            base_commit_id,
            remote_commit_id
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            vault_id,
            input.entry_id,
            input.original_path,
            input.conflict_path,
            input.base_commit_id,
            input.remote_commit_id,
        ],
    )
    .context("Failed to record sync conflict")?;

    let conflict_id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, vault_id, entry_id, original_path, conflict_path,
                base_commit_id, remote_commit_id, status, created_at
         FROM sync_conflict
         WHERE id = ?1",
        params![conflict_id],
        map_sync_conflict_row,
    )
    .context("Failed to reload sync conflict after insert")
}

pub fn list_open_sync_conflicts(
    db_path: &Path,
    workspace_root: &Path,
) -> Result<Vec<SyncConflictRecord>> {
    let conn = open_vault_connection(db_path)?;
    let vault_id = ensure_sync_vault_row(&conn, workspace_root)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, vault_id, entry_id, original_path, conflict_path,
                    base_commit_id, remote_commit_id, status, created_at
             FROM sync_conflict
             WHERE vault_id = ?1 AND status = 'open'
             ORDER BY created_at DESC, id DESC",
        )
        .context("Failed to prepare sync conflict list query")?;

    let conflicts = stmt
        .query_map(params![vault_id], map_sync_conflict_row)
        .context("Failed to load sync conflicts")?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to read sync conflict rows")?;

    Ok(conflicts)
}

pub fn mark_sync_conflict_resolved(db_path: &Path, conflict_id: i64) -> Result<()> {
    let conn = open_vault_connection(db_path)?;
    conn.execute(
        "UPDATE sync_conflict SET status = 'resolved' WHERE id = ?1",
        params![conflict_id],
    )
    .context("Failed to mark sync conflict resolved")?;

    Ok(())
}

pub fn record_sync_exclusion_event(
    db_path: &Path,
    workspace_root: &Path,
    input: &RecordSyncExclusionEventInput,
) -> Result<SyncExclusionEventRecord> {
    let conn = open_vault_connection(db_path)?;
    let vault_id = ensure_sync_vault_row(&conn, workspace_root)?;

    conn.execute(
        "INSERT INTO sync_exclusion_event (vault_id, local_path, reason)
         VALUES (?1, ?2, ?3)",
        params![vault_id, input.local_path, input.reason],
    )
    .context("Failed to record sync exclusion event")?;

    let event_id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, vault_id, local_path, reason, created_at
         FROM sync_exclusion_event
         WHERE id = ?1",
        params![event_id],
        map_sync_exclusion_row,
    )
    .context("Failed to reload sync exclusion event after insert")
}

pub fn list_sync_exclusion_events(
    db_path: &Path,
    workspace_root: &Path,
    limit: usize,
) -> Result<Vec<SyncExclusionEventRecord>> {
    let conn = open_vault_connection(db_path)?;
    let vault_id = ensure_sync_vault_row(&conn, workspace_root)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, vault_id, local_path, reason, created_at
             FROM sync_exclusion_event
             WHERE vault_id = ?1
             ORDER BY created_at DESC, id DESC
             LIMIT ?2",
        )
        .context("Failed to prepare sync exclusion list query")?;

    let exclusions = stmt
        .query_map(params![vault_id, limit as i64], map_sync_exclusion_row)
        .context("Failed to load sync exclusion events")?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Failed to read sync exclusion rows")?;

    Ok(exclusions)
}

pub fn clear_sync_exclusion_events(db_path: &Path, workspace_root: &Path) -> Result<()> {
    let conn = open_vault_connection(db_path)?;
    let vault_id = ensure_sync_vault_row(&conn, workspace_root)?;

    conn.execute(
        "DELETE FROM sync_exclusion_event WHERE vault_id = ?1",
        params![vault_id],
    )
    .context("Failed to clear sync exclusion events")?;

    Ok(())
}

pub fn persist_sync_state(
    db_path: &Path,
    workspace_root: &Path,
    input: &PersistSyncStateInput,
) -> Result<PersistSyncStateResult> {
    let conn = open_vault_connection(db_path)?;
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION")
        .context("Failed to begin sync state transaction")?;

    let result = (|| {
        if let Some(exclusion_events) = &input.replace_exclusion_events {
            clear_sync_exclusion_events_with_conn(&conn, workspace_root)?;
            for event in exclusion_events {
                record_sync_exclusion_event_with_conn(&conn, workspace_root, event)?;
            }
        }

        for entry in &input.upsert_entries {
            upsert_sync_entry_with_conn(&conn, workspace_root, entry)?;
        }

        for entry_id in &input.deleted_entry_ids {
            delete_sync_entry_with_conn(&conn, workspace_root, entry_id)?;
        }

        let sync_vault_state = input
            .sync_vault_state
            .as_ref()
            .map(|vault_state| save_sync_vault_state_with_conn(&conn, workspace_root, vault_state))
            .transpose()?;

        for conflict in &input.conflicts {
            record_sync_conflict_with_conn(&conn, workspace_root, conflict)?;
        }

        Ok(PersistSyncStateResult {
            sync_vault_state,
            entries: list_sync_entries_with_conn(&conn, workspace_root)?,
            exclusion_events: list_sync_exclusion_events_with_conn(
                &conn,
                workspace_root,
                input.exclusion_events_limit,
            )?,
        })
    })();

    match result {
        Ok(result) => {
            conn.execute_batch("COMMIT")
                .context("Failed to commit sync state transaction")?;
            Ok(result)
        }
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        clear_sync_exclusion_events, delete_sync_entry, get_sync_entry_by_local_path,
        get_sync_vault_state, list_open_sync_conflicts, list_sync_entries,
        list_sync_exclusion_events, mark_sync_conflict_resolved, record_sync_conflict,
        record_sync_exclusion_event, save_sync_vault_state, touch_sync_vault_state,
        upsert_sync_entry, RecordSyncConflictInput, RecordSyncExclusionEventInput,
        SaveSyncVaultStateInput, UpsertSyncEntryInput,
    };
    use crate::migrations;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct SyncHarness {
        root: PathBuf,
        db_path: PathBuf,
    }

    impl SyncHarness {
        fn new(prefix: &str) -> Self {
            let mut root = std::env::temp_dir();
            root.push(format!("{prefix}-{}", unique_id()));
            fs::create_dir_all(&root).expect("failed to create temp root");

            let db_path = root.join("sync-test.sqlite");
            migrations::run_migrations_at(&db_path).expect("failed to run test migrations");

            Self { root, db_path }
        }

        fn create_workspace(&self, name: &str) -> PathBuf {
            let path = self.root.join(name);
            fs::create_dir_all(&path).expect("failed to create workspace");
            path
        }
    }

    impl Drop for SyncHarness {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn sync_vault_state_can_be_saved_and_loaded_for_appdata_workspace() {
        let harness = SyncHarness::new("mdit-sync-vault-state");
        let workspace = harness.create_workspace("workspace");

        let saved = save_sync_vault_state(
            &harness.db_path,
            &workspace,
            &SaveSyncVaultStateInput {
                remote_vault_id: Some("remote-vault-1".to_string()),
                last_synced_commit_id: Some("commit-1".to_string()),
                current_key_version: 3,
                last_remote_head_seen: Some("commit-2".to_string()),
                last_scan_at: Some("2026-03-10T00:00:00.000Z".to_string()),
            },
        )
        .expect("save should succeed");

        let loaded = get_sync_vault_state(&harness.db_path, &workspace)
            .expect("load should succeed")
            .expect("state should exist");

        assert_eq!(saved, loaded);
        assert_eq!(loaded.remote_vault_id.as_deref(), Some("remote-vault-1"));
        assert_eq!(loaded.current_key_version, 3);
    }

    #[test]
    fn touching_sync_vault_state_preserves_existing_appdata_fields() {
        let harness = SyncHarness::new("mdit-sync-vault-touch");
        let workspace = harness.create_workspace("workspace");

        save_sync_vault_state(
            &harness.db_path,
            &workspace,
            &SaveSyncVaultStateInput {
                remote_vault_id: Some("remote-vault-1".to_string()),
                last_synced_commit_id: Some("commit-9".to_string()),
                current_key_version: 4,
                last_remote_head_seen: Some("commit-10".to_string()),
                last_scan_at: Some("2026-03-10T00:00:00.000Z".to_string()),
            },
        )
        .expect("initial save should succeed");

        let touched =
            touch_sync_vault_state(&harness.db_path, &workspace).expect("touch should succeed");

        assert_eq!(touched.remote_vault_id.as_deref(), Some("remote-vault-1"));
        assert_eq!(touched.last_synced_commit_id.as_deref(), Some("commit-9"));
        assert_eq!(touched.current_key_version, 4);
        assert_eq!(touched.last_remote_head_seen.as_deref(), Some("commit-10"));
    }

    #[test]
    fn sync_entries_can_be_upserted_listed_and_deleted() {
        let harness = SyncHarness::new("mdit-sync-entries");
        let workspace = harness.create_workspace("workspace");
        let local_path = "notes/note.md";

        let inserted = upsert_sync_entry(
            &harness.db_path,
            &workspace,
            &UpsertSyncEntryInput {
                entry_id: "entry-1".to_string(),
                parent_entry_id: Some("dir-1".to_string()),
                name: "note.md".to_string(),
                kind: "file".to_string(),
                local_path: local_path.to_string(),
                last_known_size: Some(42),
                last_known_mtime_ns: Some(99),
                last_known_content_hash: Some("hash-1".to_string()),
                last_synced_blob_id: Some("blob-1".to_string()),
                last_synced_content_hash: Some("hash-1".to_string()),
                sync_state: "pending".to_string(),
            },
        )
        .expect("insert should succeed");

        let fetched = get_sync_entry_by_local_path(&harness.db_path, &workspace, local_path)
            .expect("lookup should succeed")
            .expect("entry should exist");

        assert_eq!(inserted, fetched);
        assert_eq!(fetched.entry_id, "entry-1");

        let listed = list_sync_entries(&harness.db_path, &workspace).expect("list should succeed");
        assert_eq!(listed.len(), 1);

        delete_sync_entry(&harness.db_path, &workspace, "entry-1").expect("delete should succeed");
        let listed_after_delete =
            list_sync_entries(&harness.db_path, &workspace).expect("list should succeed");
        assert!(listed_after_delete.is_empty());
    }

    #[test]
    fn conflicts_and_exclusions_are_recorded_in_appdata_sync_tables() {
        let harness = SyncHarness::new("mdit-sync-conflicts");
        let workspace = harness.create_workspace("workspace");

        let conflict = record_sync_conflict(
            &harness.db_path,
            &workspace,
            &RecordSyncConflictInput {
                entry_id: Some("entry-1".to_string()),
                original_path: "notes/note.md".to_string(),
                conflict_path: "notes/note.md".to_string(),
                base_commit_id: Some("commit-1".to_string()),
                remote_commit_id: "commit-2".to_string(),
            },
        )
        .expect("record conflict should succeed");

        let open_conflicts =
            list_open_sync_conflicts(&harness.db_path, &workspace).expect("list should succeed");
        assert_eq!(open_conflicts.len(), 1);
        assert_eq!(open_conflicts[0].id, conflict.id);

        mark_sync_conflict_resolved(&harness.db_path, conflict.id).expect("resolve should succeed");
        let open_conflicts_after =
            list_open_sync_conflicts(&harness.db_path, &workspace).expect("list should succeed");
        assert!(open_conflicts_after.is_empty());

        let exclusion = record_sync_exclusion_event(
            &harness.db_path,
            &workspace,
            &RecordSyncExclusionEventInput {
                local_path: "large/video.mov".to_string(),
                reason: "size_limit_exceeded".to_string(),
            },
        )
        .expect("record exclusion should succeed");

        let exclusions = list_sync_exclusion_events(&harness.db_path, &workspace, 10)
            .expect("list exclusions should succeed");
        assert_eq!(exclusions.len(), 1);
        assert_eq!(exclusions[0], exclusion);

        clear_sync_exclusion_events(&harness.db_path, &workspace)
            .expect("clear exclusions should succeed");
        let exclusions_after_clear = list_sync_exclusion_events(&harness.db_path, &workspace, 10)
            .expect("list exclusions should succeed");
        assert!(exclusions_after_clear.is_empty());
    }

    fn unique_id() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos()
    }
}
