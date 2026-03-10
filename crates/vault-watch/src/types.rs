use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const VAULT_WATCH_BATCH_EVENT: &str = "vault-watch-batch";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum VaultEntryKind {
    File,
    Directory,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum VaultEntryState {
    Missing,
    File,
    Directory,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum VaultWatchReason {
    BootstrapFailure,
    WatcherOverflow,
    WatcherError,
    AmbiguousRename,
    DirectoryCreate,
    DirectoryMoveIn,
    DirectoryMoveWithin,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
pub enum VaultWatchOp {
    PathState {
        #[serde(rename = "relPath")]
        rel_path: String,
        before: VaultEntryState,
        after: VaultEntryState,
    },
    Move {
        #[serde(rename = "fromRel")]
        from_rel: String,
        #[serde(rename = "toRel")]
        to_rel: String,
        #[serde(rename = "entryKind")]
        entry_kind: VaultEntryKind,
    },
    ScanTree {
        #[serde(rename = "relPrefix")]
        rel_prefix: String,
        reason: VaultWatchReason,
    },
    FullRescan {
        reason: VaultWatchReason,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultWatchBatch {
    pub stream_id: String,
    pub seq_in_stream: u64,
    #[serde(default)]
    pub ops: Vec<VaultWatchOp>,
    pub emitted_at_unix_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultWatchBatchPayload {
    pub workspace_path: String,
    pub batch: VaultWatchBatch,
}

impl VaultWatchBatch {
    pub(crate) fn empty(stream_id: String, seq_in_stream: u64) -> Self {
        Self {
            stream_id,
            seq_in_stream,
            ops: Vec::new(),
            emitted_at_unix_ms: now_unix_ms(),
        }
    }

    pub(crate) fn has_payload(&self) -> bool {
        !self.ops.is_empty()
    }
}

#[derive(Debug, Clone)]
pub struct WatchConfig {
    pub debounce_timeout_ms: u64,
    pub debounce_tick_rate_ms: Option<u64>,
    pub channel_capacity: usize,
    pub rename_pair_window_ms: u64,
    pub max_batch_paths: usize,
    pub recursive: bool,
    pub bootstrap_dir_index: bool,
}

impl Default for WatchConfig {
    fn default() -> Self {
        Self {
            debounce_timeout_ms: 250,
            debounce_tick_rate_ms: None,
            channel_capacity: 4096,
            rename_pair_window_ms: 1000,
            max_batch_paths: 10_000,
            recursive: true,
            bootstrap_dir_index: true,
        }
    }
}

impl WatchConfig {
    pub(crate) fn normalized(&self) -> Self {
        let debounce_timeout_ms = self.debounce_timeout_ms.max(1);
        Self {
            debounce_timeout_ms,
            debounce_tick_rate_ms: self
                .debounce_tick_rate_ms
                .map(|tick_ms| tick_ms.max(1).min(debounce_timeout_ms)),
            channel_capacity: self.channel_capacity.max(1),
            rename_pair_window_ms: self.rename_pair_window_ms.max(1),
            max_batch_paths: self.max_batch_paths.max(1),
            recursive: self.recursive,
            bootstrap_dir_index: self.bootstrap_dir_index,
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{VaultEntryKind, VaultEntryState, VaultWatchOp, VaultWatchReason, WatchConfig};

    #[test]
    fn serializes_vault_watch_fields_as_camel_case() {
        let path_state = VaultWatchOp::PathState {
            rel_path: "docs/a.md".to_string(),
            before: VaultEntryState::File,
            after: VaultEntryState::Missing,
        };
        assert_eq!(
            serde_json::to_value(path_state).expect("path state op should serialize"),
            json!({
                "type": "pathState",
                "relPath": "docs/a.md",
                "before": "file",
                "after": "missing"
            })
        );

        let moved = VaultWatchOp::Move {
            from_rel: "docs/a.md".to_string(),
            to_rel: "docs/b.md".to_string(),
            entry_kind: VaultEntryKind::Directory,
        };
        assert_eq!(
            serde_json::to_value(moved).expect("moved change should serialize"),
            json!({
                "type": "move",
                "fromRel": "docs/a.md",
                "toRel": "docs/b.md",
                "entryKind": "directory"
            })
        );

        let rescan = VaultWatchOp::FullRescan {
            reason: VaultWatchReason::WatcherError,
        };
        assert_eq!(
            serde_json::to_value(rescan).expect("full rescan op should serialize"),
            json!({
                "type": "fullRescan",
                "reason": "watcherError"
            })
        );
    }

    #[test]
    fn normalized_watch_config_clamps_numeric_fields() {
        let config = WatchConfig {
            debounce_timeout_ms: 0,
            debounce_tick_rate_ms: Some(10),
            channel_capacity: 0,
            rename_pair_window_ms: 0,
            max_batch_paths: 0,
            recursive: false,
            bootstrap_dir_index: false,
        };

        let normalized = config.normalized();
        assert_eq!(normalized.debounce_timeout_ms, 1);
        assert_eq!(normalized.debounce_tick_rate_ms, Some(1));
        assert_eq!(normalized.channel_capacity, 1);
        assert_eq!(normalized.rename_pair_window_ms, 1);
        assert_eq!(normalized.max_batch_paths, 1);
        assert!(!normalized.recursive);
        assert!(!normalized.bootstrap_dir_index);
    }

    #[test]
    fn normalized_watch_config_leaves_tick_rate_unset_when_unspecified() {
        let normalized = WatchConfig::default().normalized();
        assert_eq!(normalized.debounce_tick_rate_ms, None);
    }
}
