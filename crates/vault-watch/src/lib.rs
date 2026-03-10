mod engine;
mod entry_index;
mod event_projector;
mod observe;
mod path;
mod scan;
mod types;
mod worker;

pub use engine::{start_vault_watch, start_vault_watch_channel, VaultWatcherHandle};
pub use types::{
    VaultEntryKind, VaultEntryState, VaultWatchBatch, VaultWatchBatchPayload, VaultWatchError,
    VaultWatchOp, VaultWatchReason, WatchConfig, VAULT_WATCH_BATCH_EVENT,
};
