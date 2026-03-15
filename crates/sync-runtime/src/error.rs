use std::fmt::{Display, Formatter};

use sync_client::SyncClientError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncRuntimeError {
    MissingDeviceId,
    SessionClosed,
    SyncClient(SyncClientError),
}

impl Display for SyncRuntimeError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingDeviceId => {
                write!(f, "push configuration requires a device_id")
            }
            Self::SessionClosed => write!(f, "continuous sync session is closed"),
            Self::SyncClient(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for SyncRuntimeError {}

impl From<SyncClientError> for SyncRuntimeError {
    fn from(value: SyncClientError) -> Self {
        Self::SyncClient(value)
    }
}
