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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
pub enum VaultChange {
    Created {
        #[serde(rename = "relPath")]
        rel_path: String,
        #[serde(rename = "entryKind")]
        entry_kind: VaultEntryKind,
    },
    Modified {
        #[serde(rename = "relPath")]
        rel_path: String,
        #[serde(rename = "entryKind")]
        entry_kind: VaultEntryKind,
    },
    Deleted {
        #[serde(rename = "relPath")]
        rel_path: String,
        #[serde(rename = "entryKind")]
        entry_kind: VaultEntryKind,
    },
    Moved {
        #[serde(rename = "fromRel")]
        from_rel: String,
        #[serde(rename = "toRel")]
        to_rel: String,
        #[serde(rename = "entryKind")]
        entry_kind: VaultEntryKind,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultChangeBatch {
    pub seq: u64,
    #[serde(default)]
    pub changes: Vec<VaultChange>,
    pub rescan: bool,
    pub emitted_at_unix_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultChangeBatchPayload {
    pub workspace_path: String,
    pub batch: VaultChangeBatch,
}

impl VaultChangeBatch {
    pub(crate) fn empty_with_seq(seq: u64) -> Self {
        Self {
            seq,
            changes: Vec::new(),
            rescan: false,
            emitted_at_unix_ms: now_unix_ms(),
        }
    }

    pub(crate) fn has_payload(&self) -> bool {
        self.rescan || !self.changes.is_empty()
    }
}

#[derive(Debug, Clone)]
pub struct WatchConfig {
    pub debounce_ms: u64,
    pub channel_capacity: usize,
    pub rename_pair_window_ms: u64,
    pub max_batch_paths: usize,
    pub recursive: bool,
    pub bootstrap_dir_index: bool,
    pub hidden_boundary_prefixes: Vec<String>,
}

impl Default for WatchConfig {
    fn default() -> Self {
        Self {
            debounce_ms: 250,
            channel_capacity: 4096,
            rename_pair_window_ms: 1000,
            max_batch_paths: 10_000,
            recursive: true,
            bootstrap_dir_index: true,
            hidden_boundary_prefixes: Vec::new(),
        }
    }
}

impl WatchConfig {
    pub(crate) fn normalized(&self) -> Self {
        let mut hidden_boundary_prefixes = self
            .hidden_boundary_prefixes
            .iter()
            .filter_map(|prefix| normalize_hidden_boundary_prefix(prefix))
            .collect::<Vec<_>>();
        hidden_boundary_prefixes.sort();
        hidden_boundary_prefixes.dedup();

        Self {
            debounce_ms: self.debounce_ms.max(1),
            channel_capacity: self.channel_capacity.max(1),
            rename_pair_window_ms: self.rename_pair_window_ms.max(1),
            max_batch_paths: self.max_batch_paths.max(1),
            recursive: self.recursive,
            bootstrap_dir_index: self.bootstrap_dir_index,
            hidden_boundary_prefixes,
        }
    }
}

fn normalize_hidden_boundary_prefix(prefix: &str) -> Option<String> {
    let normalized = prefix.replace('\\', "/");
    let mut normalized = normalized.as_str();

    while let Some(stripped) = normalized.strip_prefix("./") {
        normalized = stripped;
    }

    normalized = normalized.trim_start_matches('/');
    normalized = normalized.trim_end_matches('/');

    if normalized.is_empty() || normalized == "." {
        return None;
    }

    Some(normalized.to_string())
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

    use super::{VaultChange, VaultEntryKind, WatchConfig};

    #[test]
    fn normalized_hidden_boundary_prefixes_are_cleaned_and_deduplicated() {
        let config = WatchConfig {
            hidden_boundary_prefixes: vec![
                String::new(),
                ".".to_string(),
                "./.mdit/".to_string(),
                "/.mdit".to_string(),
                "\\.mdit\\".to_string(),
                ".cache".to_string(),
                "./.cache".to_string(),
            ],
            ..WatchConfig::default()
        };

        let normalized = config.normalized();
        assert_eq!(
            normalized.hidden_boundary_prefixes,
            vec![".cache".to_string(), ".mdit".to_string()]
        );
    }

    #[test]
    fn serializes_vault_change_fields_as_camel_case() {
        let created = VaultChange::Created {
            rel_path: "docs/a.md".to_string(),
            entry_kind: VaultEntryKind::File,
        };
        assert_eq!(
            serde_json::to_value(created).expect("created change should serialize"),
            json!({
                "type": "created",
                "relPath": "docs/a.md",
                "entryKind": "file"
            })
        );

        let moved = VaultChange::Moved {
            from_rel: "docs/a.md".to_string(),
            to_rel: "docs/b.md".to_string(),
            entry_kind: VaultEntryKind::Directory,
        };
        assert_eq!(
            serde_json::to_value(moved).expect("moved change should serialize"),
            json!({
                "type": "moved",
                "fromRel": "docs/a.md",
                "toRel": "docs/b.md",
                "entryKind": "directory"
            })
        );
    }
}
