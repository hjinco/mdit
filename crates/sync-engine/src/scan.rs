mod matcher;
mod service;
mod walker;

pub(crate) use service::build_local_workspace_snapshot;
pub use service::scan_workspace;
