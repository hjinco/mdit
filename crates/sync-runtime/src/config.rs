use std::path::PathBuf;

use sync_client::{PullWorkspaceInput, PushWorkspaceInput};

use crate::SyncRuntimeError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncPathsConfig {
    pub workspace_root: PathBuf,
    pub db_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncServerConfig {
    pub server_url: String,
    pub vault_id: String,
    pub auth_token: String,
    pub user_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncIdentityConfig {
    pub device_id: Option<String>,
    pub vault_key_hex: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncRuntimeConfig {
    pub session_id: u64,
    pub paths: SyncPathsConfig,
    pub server: SyncServerConfig,
    pub identity: SyncIdentityConfig,
    pub max_file_size_bytes: Option<u64>,
}

impl SyncRuntimeConfig {
    pub fn to_pull_input(&self) -> PullWorkspaceInput {
        PullWorkspaceInput {
            session_id: self.session_id,
            workspace_root: self.paths.workspace_root.clone(),
            db_path: self.paths.db_path.clone(),
            server_url: self.server.server_url.clone(),
            vault_id: self.server.vault_id.clone(),
            auth_token: self.server.auth_token.clone(),
            user_id: self.server.user_id.clone(),
            vault_key_hex: self.identity.vault_key_hex.clone(),
            max_file_size_bytes: self.max_file_size_bytes,
        }
    }

    pub fn to_push_input(&self) -> Result<PushWorkspaceInput, SyncRuntimeError> {
        let Some(device_id) = self.identity.device_id.clone() else {
            return Err(SyncRuntimeError::MissingDeviceId);
        };

        Ok(PushWorkspaceInput {
            session_id: self.session_id,
            workspace_root: self.paths.workspace_root.clone(),
            db_path: self.paths.db_path.clone(),
            server_url: self.server.server_url.clone(),
            vault_id: self.server.vault_id.clone(),
            auth_token: self.server.auth_token.clone(),
            user_id: self.server.user_id.clone(),
            device_id,
            vault_key_hex: self.identity.vault_key_hex.clone(),
            max_file_size_bytes: self.max_file_size_bytes,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{SyncIdentityConfig, SyncPathsConfig, SyncRuntimeConfig, SyncServerConfig};
    use crate::SyncRuntimeError;

    fn runtime_config() -> SyncRuntimeConfig {
        SyncRuntimeConfig {
            session_id: 7,
            paths: SyncPathsConfig {
                workspace_root: PathBuf::from("/tmp/workspace"),
                db_path: PathBuf::from("/tmp/appdata.sqlite"),
            },
            server: SyncServerConfig {
                server_url: "https://sync.mdit.app".to_string(),
                vault_id: "vault-1".to_string(),
                auth_token: "token".to_string(),
                user_id: "user-1".to_string(),
            },
            identity: SyncIdentityConfig {
                device_id: Some("device-1".to_string()),
                vault_key_hex: "00112233".to_string(),
            },
            max_file_size_bytes: Some(1024),
        }
    }

    #[test]
    fn builds_pull_input_from_shared_runtime_config() {
        let input = runtime_config().to_pull_input();

        assert_eq!(input.session_id, 7);
        assert_eq!(input.workspace_root, PathBuf::from("/tmp/workspace"));
        assert_eq!(input.db_path, PathBuf::from("/tmp/appdata.sqlite"));
        assert_eq!(input.server_url, "https://sync.mdit.app");
        assert_eq!(input.vault_id, "vault-1");
        assert_eq!(input.auth_token, "token");
        assert_eq!(input.user_id, "user-1");
        assert_eq!(input.vault_key_hex, "00112233");
        assert_eq!(input.max_file_size_bytes, Some(1024));
    }

    #[test]
    fn requires_device_id_for_push_input() {
        let mut config = runtime_config();
        config.identity.device_id = None;

        assert_eq!(
            config.to_push_input(),
            Err(SyncRuntimeError::MissingDeviceId)
        );
    }
}
