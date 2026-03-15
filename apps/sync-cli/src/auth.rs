use std::{
    io::Write,
    path::Path,
    time::{Duration, SystemTime},
};

use serde::Deserialize;

use crate::{
    cli::LoginCommand,
    config::{default_auth_url, now_unix_ms, resolve_env_value, save_config, StoredConfig, AUTH_URL_ENV},
    store::TokenStore,
};

pub const DEVICE_CLIENT_ID: &str = "mdit-sync-cli";
pub const DEVICE_GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:device_code";

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct DeviceTokenSuccess {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: u64,
    pub scope: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct DeviceTokenError {
    pub error: String,
    pub error_description: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionUser {
    pub id: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionLookupResponse {
    pub user: SessionUser,
}

pub trait DeviceAuthApi {
    fn request_device_code(&self, auth_url: &str) -> Result<DeviceCodeResponse, String>;
    fn exchange_device_token(
        &self,
        auth_url: &str,
        device_code: &str,
    ) -> Result<Result<DeviceTokenSuccess, DeviceTokenError>, String>;
    fn resolve_user_id(&self, auth_url: &str, access_token: &str) -> Result<String, String>;
}

pub fn run_login(
    command: &LoginCommand,
    config_path: &Path,
    config: &StoredConfig,
    auth_api: &impl DeviceAuthApi,
    token_store: &impl TokenStore,
    stdout: &mut impl Write,
    sleep: &mut impl FnMut(Duration),
) -> Result<(), String> {
    let auth_url = resolve_env_value(AUTH_URL_ENV).unwrap_or_else(|| default_auth_url().to_string());

    let device_code = auth_api.request_device_code(&auth_url)?;
    write_login_instructions(stdout, &device_code)?;

    let access_token = poll_for_access_token(auth_api, &auth_url, &device_code, sleep)?;
    let user_id = auth_api.resolve_user_id(&auth_url, &access_token)?;
    persist_access_token(command.print_token, token_store, &access_token, stdout)?;
    save_login_config(config_path, config, user_id)?;

    writeln!(stdout, "\nLogin complete.")
        .map_err(|error| format!("failed to write login success output: {error}"))?;
    Ok(())
}

fn write_login_instructions(
    stdout: &mut impl Write,
    device_code: &DeviceCodeResponse,
) -> Result<(), String> {
    writeln!(
        stdout,
        "Open this URL on any device:\n  {}\n\nIf the page does not prefill the code, enter:\n  {}",
        device_code.verification_uri_complete, device_code.user_code
    )
    .map_err(|error| format!("failed to write login instructions: {error}"))
}

fn poll_for_access_token(
    auth_api: &impl DeviceAuthApi,
    auth_url: &str,
    device_code: &DeviceCodeResponse,
    sleep: &mut impl FnMut(Duration),
) -> Result<String, String> {
    let deadline = SystemTime::now()
        .checked_add(Duration::from_secs(device_code.expires_in))
        .ok_or_else(|| "device authorization expiry overflowed".to_string())?;
    let mut next_interval = device_code.interval.max(1);

    loop {
        if SystemTime::now() >= deadline {
            return Err("device authorization timed out before approval".to_string());
        }

        match auth_api.exchange_device_token(auth_url, &device_code.device_code)? {
            Ok(token_response) => return Ok(token_response.access_token),
            Err(error) => match error.error.as_str() {
                "authorization_pending" => sleep(Duration::from_secs(next_interval)),
                "slow_down" => {
                    next_interval += 5;
                    sleep(Duration::from_secs(next_interval));
                }
                "expired_token" => {
                    return Err("device authorization expired before approval".to_string());
                }
                "access_denied" => return Err("device authorization was denied".to_string()),
                "invalid_grant" => {
                    return Err(format!(
                        "device authorization failed: {}",
                        error.error_description
                    ));
                }
                "invalid_request" => {
                    return Err(format!(
                        "device authorization request was rejected: {}",
                        error.error_description
                    ));
                }
                other => {
                    return Err(format!(
                        "device authorization failed with `{other}`: {}",
                        error.error_description
                    ));
                }
            },
        }
    }
}

fn persist_access_token(
    print_token: bool,
    token_store: &impl TokenStore,
    access_token: &str,
    stdout: &mut impl Write,
) -> Result<(), String> {
    match token_store.save(access_token) {
        Ok(()) => {
            if print_token {
                writeln!(stdout, "\nAccess token:\n{access_token}")
                    .map_err(|error| format!("failed to write token: {error}"))?;
            }
            Ok(())
        }
        Err(error) if print_token => writeln!(
            stdout,
            "\nKeyring storage failed ({error}). Access token:\n{access_token}"
        )
        .map_err(|write_error| format!("failed to write token fallback output: {write_error}")),
        Err(error) => Err(format!(
            "{error}\nrerun with `mdit-sync login --print-token` if this environment cannot use the OS keyring"
        )),
    }
}

fn save_login_config(
    config_path: &Path,
    config: &StoredConfig,
    user_id: String,
) -> Result<(), String> {
    let mut next_config = config.clone();
    next_config.user_id = Some(user_id);
    next_config.last_login_at_ms = Some(now_unix_ms()?);
    save_config(config_path, &next_config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::TokenStore;
    use std::{cell::RefCell, env, fs, path::PathBuf, time::UNIX_EPOCH};

    #[derive(Default)]
    struct MemoryTokenStore {
        fail_save: bool,
    }

    impl TokenStore for MemoryTokenStore {
        fn load(&self) -> Result<Option<String>, String> {
            Ok(None)
        }

        fn save(&self, _token: &str) -> Result<(), String> {
            if self.fail_save {
                return Err("keyring unavailable".to_string());
            }
            Ok(())
        }
    }

    struct MockAuthApi {
        code_response: DeviceCodeResponse,
        token_responses: RefCell<Vec<Result<DeviceTokenSuccess, DeviceTokenError>>>,
        user_id: String,
    }

    impl DeviceAuthApi for MockAuthApi {
        fn request_device_code(&self, _auth_url: &str) -> Result<DeviceCodeResponse, String> {
            Ok(self.code_response.clone())
        }

        fn exchange_device_token(
            &self,
            _auth_url: &str,
            _device_code: &str,
        ) -> Result<Result<DeviceTokenSuccess, DeviceTokenError>, String> {
            Ok(self.token_responses.borrow_mut().remove(0))
        }

        fn resolve_user_id(&self, _auth_url: &str, _access_token: &str) -> Result<String, String> {
            Ok(self.user_id.clone())
        }
    }

    fn unique_test_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be valid")
            .as_nanos();
        env::temp_dir().join(format!("mdit-sync-cli-{name}-{nanos}.toml"))
    }

    fn device_code_response() -> DeviceCodeResponse {
        DeviceCodeResponse {
            device_code: "device-1".to_string(),
            user_code: "ABCD-EFGH".to_string(),
            verification_uri: "https://auth.example.com/device".to_string(),
            verification_uri_complete: "https://auth.example.com/device?user_code=ABCDEFGH"
                .to_string(),
            expires_in: 600,
            interval: 1,
        }
    }

    fn mock_auth_api(
        token_responses: Vec<Result<DeviceTokenSuccess, DeviceTokenError>>,
    ) -> MockAuthApi {
        MockAuthApi {
            code_response: device_code_response(),
            token_responses: RefCell::new(token_responses),
            user_id: "user-1".to_string(),
        }
    }

    #[test]
    fn login_prints_instructions_and_writes_config() {
        let config_path = unique_test_path("login-success");
        let auth_api = mock_auth_api(vec![Ok(DeviceTokenSuccess {
            access_token: "token-1".to_string(),
            token_type: "Bearer".to_string(),
            expires_in: 3600,
            scope: "".to_string(),
        })]);
        let token_store = MemoryTokenStore::default();
        let mut stdout = Vec::new();
        let mut sleeper = |_duration: Duration| {};

        run_login(
            &LoginCommand {
                print_token: false,
            },
            &config_path,
            &StoredConfig::default(),
            &auth_api,
            &token_store,
            &mut stdout,
            &mut sleeper,
        )
        .expect("login should succeed");

        let output = String::from_utf8(stdout).expect("stdout should be UTF-8");
        assert!(output.contains("https://auth.example.com/device?user_code=ABCDEFGH"));
        assert!(output.contains("ABCD-EFGH"));

        let saved = crate::config::load_config(&config_path).expect("config should load");
        assert_eq!(saved.user_id.as_deref(), Some("user-1"));
        assert!(saved.last_login_at_ms.is_some());

        let _ = fs::remove_file(config_path);
    }

    #[test]
    fn login_handles_pending_and_slow_down_before_success() {
        let config_path = unique_test_path("login-pending");
        let auth_api = mock_auth_api(vec![
            Err(DeviceTokenError {
                error: "authorization_pending".to_string(),
                error_description: "pending".to_string(),
            }),
            Err(DeviceTokenError {
                error: "slow_down".to_string(),
                error_description: "slow down".to_string(),
            }),
            Ok(DeviceTokenSuccess {
                access_token: "token-1".to_string(),
                token_type: "Bearer".to_string(),
                expires_in: 3600,
                scope: "".to_string(),
            }),
        ]);
        let token_store = MemoryTokenStore::default();
        let mut stdout = Vec::new();
        let mut sleep_calls = Vec::new();
        let mut sleeper = |duration: Duration| sleep_calls.push(duration.as_secs());

        run_login(
            &LoginCommand {
                print_token: false,
            },
            &config_path,
            &StoredConfig::default(),
            &auth_api,
            &token_store,
            &mut stdout,
            &mut sleeper,
        )
        .expect("login should succeed");

        assert_eq!(sleep_calls, vec![1, 6]);

        let _ = fs::remove_file(config_path);
    }

    #[test]
    fn login_print_token_mode_falls_back_when_keyring_is_unavailable() {
        let config_path = unique_test_path("login-print-token");
        let auth_api = mock_auth_api(vec![Ok(DeviceTokenSuccess {
            access_token: "token-1".to_string(),
            token_type: "Bearer".to_string(),
            expires_in: 3600,
            scope: "".to_string(),
        })]);
        let token_store = MemoryTokenStore {
            fail_save: true,
        };
        let mut stdout = Vec::new();
        let mut sleeper = |_duration: Duration| {};

        run_login(
            &LoginCommand {
                print_token: true,
            },
            &config_path,
            &StoredConfig::default(),
            &auth_api,
            &token_store,
            &mut stdout,
            &mut sleeper,
        )
        .expect("login should succeed");

        let output = String::from_utf8(stdout).expect("stdout should be UTF-8");
        assert!(output.contains("token-1"));

        let _ = fs::remove_file(config_path);
    }
}
