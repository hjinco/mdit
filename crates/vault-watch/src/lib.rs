mod engine;
mod normalize;
mod path;
mod types;
mod worker;

pub use engine::{start_vault_watch, VaultWatcherHandle};
pub use types::{
    EventBatch, EventBatchPayload, RenamePair, VaultWatchError, WatchConfig,
    VAULT_WATCH_BATCH_EVENT,
};
