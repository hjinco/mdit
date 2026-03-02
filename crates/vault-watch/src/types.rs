use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const VAULT_WATCH_BATCH_EVENT: &str = "vault-watch-batch";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RenamePair {
    pub from_rel: String,
    pub to_rel: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EventBatch {
    pub seq: u64,
    pub vault_rel_created: Vec<String>,
    pub vault_rel_modified: Vec<String>,
    pub vault_rel_removed: Vec<String>,
    pub vault_rel_renamed: Vec<RenamePair>,
    pub rescan: bool,
    pub emitted_at_unix_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EventBatchPayload {
    pub workspace_path: String,
    pub batch: EventBatch,
}

impl EventBatch {
    pub(crate) fn empty_with_seq(seq: u64) -> Self {
        Self {
            seq,
            vault_rel_created: Vec::new(),
            vault_rel_modified: Vec::new(),
            vault_rel_removed: Vec::new(),
            vault_rel_renamed: Vec::new(),
            rescan: false,
            emitted_at_unix_ms: now_unix_ms(),
        }
    }

    pub(crate) fn has_payload(&self) -> bool {
        self.rescan
            || !self.vault_rel_created.is_empty()
            || !self.vault_rel_modified.is_empty()
            || !self.vault_rel_removed.is_empty()
            || !self.vault_rel_renamed.is_empty()
    }
}

#[derive(Debug, Clone)]
pub struct WatchConfig {
    pub debounce_ms: u64,
    pub channel_capacity: usize,
    pub rename_pair_window_ms: u64,
    pub max_batch_paths: usize,
    pub recursive: bool,
}

impl Default for WatchConfig {
    fn default() -> Self {
        Self {
            debounce_ms: 250,
            channel_capacity: 4096,
            rename_pair_window_ms: 1000,
            max_batch_paths: 10_000,
            recursive: true,
        }
    }
}

impl WatchConfig {
    pub(crate) fn normalized(&self) -> Self {
        Self {
            debounce_ms: self.debounce_ms.max(1),
            channel_capacity: self.channel_capacity.max(1),
            rename_pair_window_ms: self.rename_pair_window_ms.max(1),
            max_batch_paths: self.max_batch_paths.max(1),
            recursive: self.recursive,
        }
    }
}

#[derive(Debug, Error)]
pub enum VaultWatchError {
    #[error("vault root does not exist: {0}")]
    VaultRootNotFound(String),
    #[error("vault root is not a directory: {0}")]
    VaultRootNotDirectory(String),
    #[error("failed to canonicalize vault root {path}: {source}")]
    CanonicalizeVaultRoot {
        path: String,
        source: std::io::Error,
    },
    #[error("failed to initialize watcher: {0}")]
    WatcherInit(#[from] notify::Error),
    #[error("failed to watch path {path}: {source}")]
    WatchPath { path: String, source: notify::Error },
    #[error("worker thread join failed")]
    WorkerJoin,
}

pub(crate) fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
