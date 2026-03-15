use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use sync_engine::{
    finalize_push_workspace, prepare_encrypted_workspace, FinalizePushInput, PersistSyncStateInput,
    PersistSyncStateResult, PreparedSyncWorkspaceResult, RecordSyncConflictInput,
    RecordSyncExclusionEventInput, SaveSyncVaultStateInput, ScanOptions, SyncEntryRecord,
    SyncExclusionEventRecord, SyncVaultState, SyncWorkspaceStore, UpsertSyncEntryInput,
};

pub(super) struct Harness {
    root: PathBuf,
    pub(super) db_path: PathBuf,
    pub(super) workspace: PathBuf,
    state: Arc<Mutex<InMemorySyncState>>,
}

impl Harness {
    pub(super) fn new(prefix: &str) -> Self {
        let mut root = std::env::temp_dir();
        root.push(format!("{prefix}-{}", unique_id()));
        fs::create_dir_all(&root).expect("failed to create temp root");

        let db_path = root.join("appdata.sqlite");
        let workspace = root.join("workspace");
        fs::create_dir_all(&workspace).expect("failed to create workspace");

        Self {
            root,
            db_path,
            workspace,
            state: Arc::new(Mutex::new(InMemorySyncState::default())),
        }
    }

    pub(super) fn write_file(&self, relative_path: &str, contents: &str) {
        let path = self.workspace.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("failed to create parent");
        }
        fs::write(path, contents).expect("failed to write file");
    }

    pub(super) fn read_file(&self, relative_path: &str) -> String {
        fs::read_to_string(self.workspace.join(relative_path)).expect("failed to read file")
    }

    pub(super) fn vault_key_hex(&self) -> String {
        "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string()
    }

    pub(super) fn store(&self) -> TestSyncStore {
        TestSyncStore {
            state: Arc::clone(&self.state),
        }
    }

    pub(super) fn prepare_encrypted(&self) -> PreparedSyncWorkspaceResult {
        prepare_encrypted_workspace(
            &self.workspace,
            &self.store(),
            &self.vault_key_hex(),
            ScanOptions::default(),
        )
        .expect("prepare encrypted workspace")
    }

    pub(super) fn prepare_committed(&self, commit_id: &str) -> PreparedSyncWorkspaceResult {
        let prepared = self.prepare_encrypted();
        finalize_push_workspace(
            &self.store(),
            &prepared,
            &FinalizePushInput {
                remote_vault_id: "vault-1".to_string(),
                last_synced_commit_id: commit_id.to_string(),
                current_key_version: 1,
            },
        )
        .expect("finalize prepared workspace");
        prepared
    }

    pub(super) fn delete_sync_entry(&self, entry_id: &str) {
        self.store()
            .delete_sync_entry(entry_id)
            .expect("delete should succeed");
    }

    pub(super) fn upsert_sync_entry(&self, input: UpsertSyncEntryInput) {
        self.store()
            .upsert_sync_entry(&input)
            .expect("upsert should succeed");
    }

    pub(super) fn save_sync_vault_state(&self, input: SaveSyncVaultStateInput) {
        self.store()
            .save_sync_vault_state(&input)
            .expect("save state should succeed");
    }
}

#[derive(Debug, Clone)]
pub(super) struct TestSyncStore {
    state: Arc<Mutex<InMemorySyncState>>,
}

impl SyncWorkspaceStore for TestSyncStore {
    fn get_sync_vault_state(&self) -> anyhow::Result<Option<SyncVaultState>> {
        Ok(self
            .state
            .lock()
            .expect("sync state lock")
            .vault_state
            .clone())
    }

    fn touch_sync_vault_state(&self) -> anyhow::Result<SyncVaultState> {
        let mut state = self.state.lock().expect("sync state lock");
        Ok(state.touch_vault_state())
    }

    fn save_sync_vault_state(
        &self,
        input: &SaveSyncVaultStateInput,
    ) -> anyhow::Result<SyncVaultState> {
        let mut state = self.state.lock().expect("sync state lock");
        Ok(state.save_vault_state(input))
    }

    fn list_sync_entries(&self) -> anyhow::Result<Vec<SyncEntryRecord>> {
        let state = self.state.lock().expect("sync state lock");
        Ok(state.entries.clone())
    }

    fn upsert_sync_entry(&self, input: &UpsertSyncEntryInput) -> anyhow::Result<SyncEntryRecord> {
        let mut state = self.state.lock().expect("sync state lock");
        Ok(state.upsert_entry(input))
    }

    fn delete_sync_entry(&self, entry_id: &str) -> anyhow::Result<()> {
        let mut state = self.state.lock().expect("sync state lock");
        state.entries.retain(|entry| entry.entry_id != entry_id);
        Ok(())
    }

    fn record_sync_conflict(&self, input: &RecordSyncConflictInput) -> anyhow::Result<()> {
        let mut state = self.state.lock().expect("sync state lock");
        state.conflicts.push(input.clone());
        Ok(())
    }

    fn record_sync_exclusion_event(
        &self,
        input: &RecordSyncExclusionEventInput,
    ) -> anyhow::Result<()> {
        let mut state = self.state.lock().expect("sync state lock");
        let id = state.next_exclusion_id;
        state.next_exclusion_id += 1;
        let vault_id = state.touch_vault_state().vault_id;
        state.exclusion_events.push(SyncExclusionEventRecord {
            id,
            vault_id,
            local_path: input.local_path.clone(),
            reason: input.reason.clone(),
            created_at: next_timestamp(),
        });
        Ok(())
    }

    fn list_sync_exclusion_events(
        &self,
        limit: usize,
    ) -> anyhow::Result<Vec<SyncExclusionEventRecord>> {
        let state = self.state.lock().expect("sync state lock");
        let start = state.exclusion_events.len().saturating_sub(limit);
        Ok(state.exclusion_events[start..].to_vec())
    }

    fn clear_sync_exclusion_events(&self) -> anyhow::Result<()> {
        let mut state = self.state.lock().expect("sync state lock");
        state.exclusion_events.clear();
        Ok(())
    }

    fn persist_sync_state(
        &self,
        input: &PersistSyncStateInput,
    ) -> anyhow::Result<PersistSyncStateResult> {
        let mut state = self.state.lock().expect("sync state lock");

        if let Some(exclusion_events) = &input.replace_exclusion_events {
            state.exclusion_events.clear();
            for event in exclusion_events {
                let id = state.next_exclusion_id;
                state.next_exclusion_id += 1;
                let vault_id = state.touch_vault_state().vault_id;
                state.exclusion_events.push(SyncExclusionEventRecord {
                    id,
                    vault_id,
                    local_path: event.local_path.clone(),
                    reason: event.reason.clone(),
                    created_at: next_timestamp(),
                });
            }
        }

        for entry in &input.upsert_entries {
            state.upsert_entry(entry);
        }

        for entry_id in &input.deleted_entry_ids {
            state.entries.retain(|entry| entry.entry_id != *entry_id);
        }

        let sync_vault_state = input
            .sync_vault_state
            .as_ref()
            .map(|vault_state| state.save_vault_state(vault_state));

        for conflict in &input.conflicts {
            state.conflicts.push(conflict.clone());
        }

        let start = state
            .exclusion_events
            .len()
            .saturating_sub(input.exclusion_events_limit);

        Ok(PersistSyncStateResult {
            sync_vault_state,
            entries: state.entries.clone(),
            exclusion_events: state.exclusion_events[start..].to_vec(),
        })
    }
}

#[derive(Debug, Default)]
struct InMemorySyncState {
    vault_state: Option<SyncVaultState>,
    entries: Vec<SyncEntryRecord>,
    exclusion_events: Vec<SyncExclusionEventRecord>,
    conflicts: Vec<RecordSyncConflictInput>,
    next_entry_id: i64,
    next_exclusion_id: i64,
}

impl InMemorySyncState {
    fn touch_vault_state(&mut self) -> SyncVaultState {
        if let Some(existing) = self.vault_state.clone() {
            existing
        } else {
            let timestamp = next_timestamp();
            let state = SyncVaultState {
                vault_id: 1,
                remote_vault_id: None,
                last_synced_commit_id: None,
                current_key_version: 0,
                last_remote_head_seen: None,
                last_scan_at: None,
                created_at: timestamp.clone(),
                updated_at: timestamp,
            };
            self.vault_state = Some(state.clone());
            self.next_entry_id = self.next_entry_id.max(1);
            self.next_exclusion_id = self.next_exclusion_id.max(1);
            state
        }
    }

    fn save_vault_state(&mut self, input: &SaveSyncVaultStateInput) -> SyncVaultState {
        let current = self.touch_vault_state();
        let next = SyncVaultState {
            remote_vault_id: input.remote_vault_id.clone(),
            last_synced_commit_id: input.last_synced_commit_id.clone(),
            current_key_version: input.current_key_version,
            last_remote_head_seen: input.last_remote_head_seen.clone(),
            last_scan_at: input.last_scan_at.clone(),
            updated_at: next_timestamp(),
            ..current
        };
        self.vault_state = Some(next.clone());
        next
    }

    fn upsert_entry(&mut self, input: &UpsertSyncEntryInput) -> SyncEntryRecord {
        let vault_id = self.touch_vault_state().vault_id;
        let updated_at = next_timestamp();

        if let Some(existing) = self
            .entries
            .iter_mut()
            .find(|entry| entry.entry_id == input.entry_id)
        {
            existing.parent_entry_id = input.parent_entry_id.clone();
            existing.name = input.name.clone();
            existing.kind = input.kind.clone();
            existing.local_path = input.local_path.clone();
            existing.last_known_size = input.last_known_size;
            existing.last_known_mtime_ns = input.last_known_mtime_ns;
            existing.last_known_content_hash = input.last_known_content_hash.clone();
            existing.last_synced_blob_id = input.last_synced_blob_id.clone();
            existing.last_synced_content_hash = input.last_synced_content_hash.clone();
            existing.sync_state = input.sync_state.clone();
            existing.updated_at = updated_at;
            return existing.clone();
        }

        self.next_entry_id += 1;
        let record = SyncEntryRecord {
            id: self.next_entry_id,
            vault_id,
            entry_id: input.entry_id.clone(),
            parent_entry_id: input.parent_entry_id.clone(),
            name: input.name.clone(),
            kind: input.kind.clone(),
            local_path: input.local_path.clone(),
            last_known_size: input.last_known_size,
            last_known_mtime_ns: input.last_known_mtime_ns,
            last_known_content_hash: input.last_known_content_hash.clone(),
            last_synced_blob_id: input.last_synced_blob_id.clone(),
            last_synced_content_hash: input.last_synced_content_hash.clone(),
            sync_state: input.sync_state.clone(),
            created_at: updated_at.clone(),
            updated_at,
        };
        self.entries.push(record.clone());
        self.entries
            .sort_by(|left, right| left.local_path.cmp(&right.local_path));
        record
    }
}

impl Drop for Harness {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn next_timestamp() -> String {
    unique_id().to_string()
}

fn unique_id() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time went backwards")
        .as_nanos()
}
