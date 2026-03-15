use std::{
    env, fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

pub const AUTH_URL_ENV: &str = "MDIT_SYNC_AUTH_URL";
#[allow(dead_code)]
pub const SYNC_URL_ENV: &str = "MDIT_SYNC_SERVER_URL";

pub fn default_auth_url() -> &'static str {
    if cfg!(debug_assertions) {
        "http://localhost:8787"
    } else {
        "https://auth.mdit.app"
    }
}

#[allow(dead_code)]
pub fn default_sync_url() -> &'static str {
    if cfg!(debug_assertions) {
        "http://localhost:8788"
    } else {
        "https://sync.mdit.app"
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredConfig {
    pub user_id: Option<String>,
    pub last_login_at_ms: Option<u64>,
}

pub fn config_path() -> Result<PathBuf, String> {
    let base = dirs::config_dir()
        .ok_or_else(|| "failed to resolve the system config directory".to_string())?;
    Ok(base.join("mdit").join("sync-cli.toml"))
}

pub fn load_config(path: &Path) -> Result<StoredConfig, String> {
    match fs::read_to_string(path) {
        Ok(contents) => toml::from_str(&contents)
            .map_err(|error| format!("failed to parse config {}: {error}", path.display())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(StoredConfig::default()),
        Err(error) => Err(format!("failed to read config {}: {error}", path.display())),
    }
}

pub fn save_config(path: &Path, config: &StoredConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!("failed to create config dir {}: {error}", parent.display())
        })?;
    }

    let contents = toml::to_string_pretty(config)
        .map_err(|error| format!("failed to encode config {}: {error}", path.display()))?;
    fs::write(path, contents)
        .map_err(|error| format!("failed to write config {}: {error}", path.display()))
}

pub fn resolve_env_value(env_key: &str) -> Option<String> {
    env::var(env_key).ok()
}

pub fn now_unix_ms() -> Result<u64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("system clock error: {error}"))?;
    u64::try_from(duration.as_millis()).map_err(|error| format!("timestamp overflow: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_test_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be valid")
            .as_nanos();
        env::temp_dir().join(format!("mdit-sync-cli-{name}-{nanos}.toml"))
    }

    #[test]
    fn resolve_env_value_reads_env() {
        unsafe {
            env::set_var("MDIT_SYNC_TEST_VALUE", "env");
        }
        assert_eq!(
            resolve_env_value("MDIT_SYNC_TEST_VALUE"),
            Some("env".to_string())
        );
        unsafe {
            env::remove_var("MDIT_SYNC_TEST_VALUE");
        }
    }

    #[test]
    fn load_and_save_config_round_trip() {
        let path = unique_test_path("config-round-trip");
        let config = StoredConfig {
            user_id: Some("user-1".to_string()),
            last_login_at_ms: Some(123),
        };

        save_config(&path, &config).expect("config should save");
        let loaded = load_config(&path).expect("config should load");
        assert_eq!(loaded, config);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn load_config_returns_default_for_missing_file() {
        let path = unique_test_path("config-missing");
        assert_eq!(load_config(&path).unwrap(), StoredConfig::default());
    }
}
