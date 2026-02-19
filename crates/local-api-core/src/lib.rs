pub mod services;

pub use services::create_note::{create_note, CreateNoteInput, CreatedNote};
pub use services::list_vaults::{list_vaults, VaultSummary};

use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalApiErrorKind {
    NotFound,
    Conflict,
    InvalidInput,
    Internal,
}

#[derive(Debug, Error)]
pub enum LocalApiError {
    #[error("vault not found: {vault_id}")]
    VaultNotFound { vault_id: i64 },

    #[error("vault workspace is unavailable: {workspace_path}")]
    VaultWorkspaceUnavailable { workspace_path: String },

    #[error("title is empty after sanitization")]
    InvalidTitle,

    #[error("directoryRelPath is invalid: {directory_rel_path}")]
    InvalidDirectoryPath { directory_rel_path: String },

    #[error("directory not found: {directory_rel_path}")]
    DirectoryNotFound { directory_rel_path: String },

    #[error("note already exists: {relative_path}")]
    NoteAlreadyExists { relative_path: String },

    #[error("internal error: {message}")]
    Internal { message: String },
}

impl LocalApiError {
    pub fn kind(&self) -> LocalApiErrorKind {
        match self {
            Self::VaultNotFound { .. }
            | Self::VaultWorkspaceUnavailable { .. }
            | Self::DirectoryNotFound { .. } => LocalApiErrorKind::NotFound,
            Self::NoteAlreadyExists { .. } => LocalApiErrorKind::Conflict,
            Self::InvalidTitle | Self::InvalidDirectoryPath { .. } => {
                LocalApiErrorKind::InvalidInput
            }
            Self::Internal { .. } => LocalApiErrorKind::Internal,
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            Self::VaultNotFound { .. } => "VAULT_NOT_FOUND",
            Self::VaultWorkspaceUnavailable { .. } => "VAULT_WORKSPACE_UNAVAILABLE",
            Self::InvalidTitle => "INVALID_NOTE_TITLE",
            Self::InvalidDirectoryPath { .. } => "INVALID_DIRECTORY_REL_PATH",
            Self::DirectoryNotFound { .. } => "DIRECTORY_NOT_FOUND",
            Self::NoteAlreadyExists { .. } => "NOTE_ALREADY_EXISTS",
            Self::Internal { .. } => "INTERNAL_ERROR",
        }
    }
}

impl From<anyhow::Error> for LocalApiError {
    fn from(error: anyhow::Error) -> Self {
        Self::Internal {
            message: error.to_string(),
        }
    }
}

impl From<std::io::Error> for LocalApiError {
    fn from(error: std::io::Error) -> Self {
        Self::Internal {
            message: error.to_string(),
        }
    }
}
