use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Error, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum SyncClientError {
    #[error("{message}")]
    Local { message: String },
    #[error("{message}")]
    Remote {
        code: String,
        message: String,
        current_head_commit_id: Option<String>,
    },
    #[error("Remote head changed before sync")]
    HeadConflict {
        current_head_commit_id: Option<String>,
    },
}

impl SyncClientError {
    pub fn local(message: impl Into<String>) -> Self {
        Self::Local {
            message: message.into(),
        }
    }

    pub fn remote(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Remote {
            code: code.into(),
            message: message.into(),
            current_head_commit_id: None,
        }
    }
}

impl From<anyhow::Error> for SyncClientError {
    fn from(value: anyhow::Error) -> Self {
        Self::local(value.to_string())
    }
}
