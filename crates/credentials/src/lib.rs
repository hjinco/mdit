use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

pub const AI_CREDENTIALS_SERVICE: &str = "app.mdit";
pub const AI_CREDENTIALS_USER: &str = "credentials";
pub const CREDENTIAL_STORE_VERSION: u8 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum ProviderId {
    Openai,
    Google,
    Anthropic,
    CodexOauth,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApiKeyProviderId {
    Openai,
    Google,
    Anthropic,
}

impl From<ApiKeyProviderId> for ProviderId {
    fn from(value: ApiKeyProviderId) -> Self {
        match value {
            ApiKeyProviderId::Openai => Self::Openai,
            ApiKeyProviderId::Google => Self::Google,
            ApiKeyProviderId::Anthropic => Self::Anthropic,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AppSecretKey {
    LocalApiToken,
    LicenseKey,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyCredential {
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexOAuthCredential {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ProviderCredential {
    ApiKey {
        #[serde(rename = "apiKey")]
        api_key: String,
    },
    Oauth {
        #[serde(rename = "accessToken")]
        access_token: String,
        #[serde(rename = "refreshToken")]
        refresh_token: String,
        #[serde(rename = "expiresAt")]
        expires_at: i64,
        #[serde(rename = "accountId", skip_serializing_if = "Option::is_none")]
        account_id: Option<String>,
    },
}

impl From<ApiKeyCredential> for ProviderCredential {
    fn from(value: ApiKeyCredential) -> Self {
        Self::ApiKey {
            api_key: value.api_key,
        }
    }
}

impl From<CodexOAuthCredential> for ProviderCredential {
    fn from(value: CodexOAuthCredential) -> Self {
        Self::Oauth {
            access_token: value.access_token,
            refresh_token: value.refresh_token,
            expires_at: value.expires_at,
            account_id: value.account_id,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CredentialStore {
    pub version: u8,
    pub providers: BTreeMap<ProviderId, ProviderCredential>,
    #[serde(rename = "localApiToken", skip_serializing_if = "Option::is_none")]
    pub local_api_token: Option<String>,
    #[serde(rename = "licenseKey", skip_serializing_if = "Option::is_none")]
    pub license_key: Option<String>,
}

impl CredentialStore {
    fn empty() -> Self {
        Self {
            version: CREDENTIAL_STORE_VERSION,
            providers: BTreeMap::new(),
            local_api_token: None,
            license_key: None,
        }
    }

    fn is_empty(&self) -> bool {
        self.providers.is_empty() && self.local_api_token.is_none() && self.license_key.is_none()
    }
}

#[derive(Debug, Error)]
pub enum CredentialsError {
    #[error("API key is required")]
    MissingApiKey,
    #[error("Secret value is required")]
    MissingSecretValue,
    #[error("Invalid Codex OAuth credential")]
    InvalidCodexOAuthCredential,
    #[error("Failed to access credential storage: {0}")]
    Storage(String),
    #[error("Failed to encode credential store: {0}")]
    Encode(#[from] serde_json::Error),
}

pub trait CredentialStoreBackend {
    fn get_password(&self, service: &str, user: &str) -> Result<Option<String>, String>;
    fn set_password(&self, service: &str, user: &str, password: &str) -> Result<(), String>;
    fn delete_password(&self, service: &str, user: &str) -> Result<(), String>;
}

fn value_as_object(value: &Value) -> Option<&serde_json::Map<String, Value>> {
    value.as_object()
}

fn decode_provider_id(value: &str) -> Option<ProviderId> {
    match value {
        "openai" => Some(ProviderId::Openai),
        "google" => Some(ProviderId::Google),
        "anthropic" => Some(ProviderId::Anthropic),
        "codex_oauth" => Some(ProviderId::CodexOauth),
        _ => None,
    }
}

fn decode_app_secret_key(value: &str) -> Option<AppSecretKey> {
    match value {
        "local_api_token" => Some(AppSecretKey::LocalApiToken),
        "license_key" => Some(AppSecretKey::LicenseKey),
        _ => None,
    }
}

fn secret_key_field(key: AppSecretKey) -> &'static str {
    match key {
        AppSecretKey::LocalApiToken => "localApiToken",
        AppSecretKey::LicenseKey => "licenseKey",
    }
}

fn decode_provider_credential(
    provider_id: ProviderId,
    value: &Value,
) -> Option<ProviderCredential> {
    let credential = serde_json::from_value::<ProviderCredential>(value.clone()).ok()?;

    match (provider_id, &credential) {
        (
            ProviderId::Openai | ProviderId::Google | ProviderId::Anthropic,
            ProviderCredential::ApiKey { .. },
        )
        | (ProviderId::CodexOauth, ProviderCredential::Oauth { .. }) => Some(credential),
        _ => None,
    }
}

pub fn decode_credential_store(raw: &str) -> CredentialStore {
    let Ok(parsed) = serde_json::from_str::<Value>(raw) else {
        return CredentialStore::empty();
    };
    let Some(root) = value_as_object(&parsed) else {
        return CredentialStore::empty();
    };
    let Some(version) = root.get("version").and_then(Value::as_u64) else {
        return CredentialStore::empty();
    };
    if version != u64::from(CREDENTIAL_STORE_VERSION) {
        return CredentialStore::empty();
    }

    let mut store = CredentialStore::empty();

    if let Some(providers) = root.get("providers").and_then(value_as_object) {
        for (provider_id_raw, value) in providers {
            let Some(provider_id) = decode_provider_id(provider_id_raw) else {
                continue;
            };
            let Some(credential) = decode_provider_credential(provider_id, value) else {
                continue;
            };
            store.providers.insert(provider_id, credential);
        }
    }

    if let Some(local_api_token) = root.get("localApiToken").and_then(Value::as_str) {
        store.local_api_token = Some(local_api_token.to_owned());
    }
    if let Some(license_key) = root.get("licenseKey").and_then(Value::as_str) {
        store.license_key = Some(license_key.to_owned());
    }

    if let Some(secrets) = root.get("secrets").and_then(value_as_object) {
        for (secret_key_raw, value) in secrets {
            let Some(secret_key) = decode_app_secret_key(secret_key_raw) else {
                continue;
            };
            let Some(secret_value) = value.as_str() else {
                continue;
            };
            match secret_key {
                AppSecretKey::LocalApiToken => {
                    store.local_api_token = Some(secret_value.to_owned());
                }
                AppSecretKey::LicenseKey => {
                    store.license_key = Some(secret_value.to_owned());
                }
            }
        }
    }

    store
}

fn save_credential_store(
    store: &CredentialStore,
    backend: &impl CredentialStoreBackend,
) -> Result<(), CredentialsError> {
    if store.is_empty() {
        backend
            .delete_password(AI_CREDENTIALS_SERVICE, AI_CREDENTIALS_USER)
            .map_err(CredentialsError::Storage)?;
        return Ok(());
    }

    let encoded = serde_json::to_string(store)?;
    backend
        .set_password(AI_CREDENTIALS_SERVICE, AI_CREDENTIALS_USER, &encoded)
        .map_err(CredentialsError::Storage)
}

pub fn load_credential_store(
    backend: &impl CredentialStoreBackend,
) -> Result<CredentialStore, CredentialsError> {
    let raw = backend
        .get_password(AI_CREDENTIALS_SERVICE, AI_CREDENTIALS_USER)
        .map_err(CredentialsError::Storage)?;
    Ok(raw
        .as_deref()
        .map(decode_credential_store)
        .unwrap_or_else(CredentialStore::empty))
}

pub fn list_credential_providers(
    backend: &impl CredentialStoreBackend,
) -> Result<Vec<ProviderId>, CredentialsError> {
    let store = load_credential_store(backend)?;
    Ok(store.providers.keys().copied().collect())
}

pub fn get_credential(
    provider_id: ProviderId,
    backend: &impl CredentialStoreBackend,
) -> Result<Option<ProviderCredential>, CredentialsError> {
    let store = load_credential_store(backend)?;
    Ok(store.providers.get(&provider_id).cloned())
}

pub fn set_api_key_credential(
    provider_id: ApiKeyProviderId,
    api_key: &str,
    backend: &impl CredentialStoreBackend,
) -> Result<(), CredentialsError> {
    let normalized_api_key = api_key.trim();
    if normalized_api_key.is_empty() {
        return Err(CredentialsError::MissingApiKey);
    }

    let mut store = load_credential_store(backend)?;
    store.providers.insert(
        provider_id.into(),
        ApiKeyCredential {
            api_key: normalized_api_key.to_owned(),
        }
        .into(),
    );
    save_credential_store(&store, backend)
}

pub fn set_codex_credential(
    credential: CodexOAuthCredential,
    backend: &impl CredentialStoreBackend,
) -> Result<(), CredentialsError> {
    if credential.access_token.is_empty()
        || credential.refresh_token.is_empty()
        || credential.expires_at <= 0
    {
        return Err(CredentialsError::InvalidCodexOAuthCredential);
    }

    let mut store = load_credential_store(backend)?;
    store
        .providers
        .insert(ProviderId::CodexOauth, credential.into());
    save_credential_store(&store, backend)
}

pub fn delete_credential(
    provider_id: ProviderId,
    backend: &impl CredentialStoreBackend,
) -> Result<(), CredentialsError> {
    let mut store = load_credential_store(backend)?;
    store.providers.remove(&provider_id);
    save_credential_store(&store, backend)
}

pub fn get_app_secret(
    key: AppSecretKey,
    backend: &impl CredentialStoreBackend,
) -> Result<Option<String>, CredentialsError> {
    let store = load_credential_store(backend)?;
    Ok(match key {
        AppSecretKey::LocalApiToken => store.local_api_token,
        AppSecretKey::LicenseKey => store.license_key,
    })
}

pub fn set_app_secret(
    key: AppSecretKey,
    value: &str,
    backend: &impl CredentialStoreBackend,
) -> Result<(), CredentialsError> {
    if value.is_empty() {
        return Err(CredentialsError::MissingSecretValue);
    }

    let mut store = load_credential_store(backend)?;
    match key {
        AppSecretKey::LocalApiToken => store.local_api_token = Some(value.to_owned()),
        AppSecretKey::LicenseKey => store.license_key = Some(value.to_owned()),
    }
    save_credential_store(&store, backend)
}

pub fn delete_app_secret(
    key: AppSecretKey,
    backend: &impl CredentialStoreBackend,
) -> Result<(), CredentialsError> {
    let mut store = load_credential_store(backend)?;
    match key {
        AppSecretKey::LocalApiToken => store.local_api_token = None,
        AppSecretKey::LicenseKey => store.license_key = None,
    }
    save_credential_store(&store, backend)
}

pub fn app_secret_key_field(key: AppSecretKey) -> &'static str {
    secret_key_field(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct TestBackend {
        value: RefCell<Option<String>>,
    }

    impl TestBackend {
        fn with_value(value: &str) -> Self {
            Self {
                value: RefCell::new(Some(value.to_owned())),
            }
        }

        fn stored_value(&self) -> Option<String> {
            self.value.borrow().clone()
        }
    }

    impl CredentialStoreBackend for TestBackend {
        fn get_password(&self, _service: &str, _user: &str) -> Result<Option<String>, String> {
            Ok(self.value.borrow().clone())
        }

        fn set_password(&self, _service: &str, _user: &str, password: &str) -> Result<(), String> {
            *self.value.borrow_mut() = Some(password.to_owned());
            Ok(())
        }

        fn delete_password(&self, _service: &str, _user: &str) -> Result<(), String> {
            *self.value.borrow_mut() = None;
            Ok(())
        }
    }

    #[test]
    fn decode_invalid_json_returns_empty_store() {
        let store = decode_credential_store("not-json");
        assert_eq!(store, CredentialStore::empty());
    }

    #[test]
    fn decode_unknown_version_returns_empty_store() {
        let store = decode_credential_store(r#"{"version":2,"providers":{}}"#);
        assert_eq!(store, CredentialStore::empty());
    }

    #[test]
    fn decode_skips_unknown_and_malformed_provider_entries() {
        let store = decode_credential_store(
            r#"{
                "version": 1,
                "providers": {
                    "openai": { "type": "api_key", "apiKey": "sk-openai" },
                    "google": { "type": "oauth", "accessToken": "bad" },
                    "unknown": { "type": "api_key", "apiKey": "sk-unknown" }
                }
            }"#,
        );

        assert_eq!(store.providers.len(), 1);
        assert_eq!(
            store.providers.get(&ProviderId::Openai),
            Some(&ProviderCredential::ApiKey {
                api_key: "sk-openai".to_owned(),
            })
        );
    }

    #[test]
    fn decode_skips_provider_entries_with_wrong_credential_type() {
        let store = decode_credential_store(
            r#"{
                "version": 1,
                "providers": {
                    "openai": {
                        "type": "oauth",
                        "accessToken": "access",
                        "refreshToken": "refresh",
                        "expiresAt": 123456
                    },
                    "codex_oauth": { "type": "api_key", "apiKey": "sk-codex" }
                }
            }"#,
        );

        assert!(store.providers.is_empty());
    }

    #[test]
    fn decode_supports_top_level_and_legacy_secret_fields() {
        let store = decode_credential_store(
            r#"{
                "version": 1,
                "providers": {},
                "localApiToken": "top-level-token",
                "secrets": {
                    "license_key": "legacy-license"
                }
            }"#,
        );

        assert_eq!(store.local_api_token.as_deref(), Some("top-level-token"));
        assert_eq!(store.license_key.as_deref(), Some("legacy-license"));
    }

    #[test]
    fn set_api_key_preserves_other_providers() {
        let backend = TestBackend::with_value(
            r#"{
                "version": 1,
                "providers": {
                    "google": { "type": "api_key", "apiKey": "sk-google" }
                }
            }"#,
        );

        set_api_key_credential(ApiKeyProviderId::Openai, " sk-openai ", &backend).unwrap();

        let store = load_credential_store(&backend).unwrap();
        assert_eq!(store.providers.len(), 2);
        assert_eq!(
            store.providers.get(&ProviderId::Openai),
            Some(&ProviderCredential::ApiKey {
                api_key: "sk-openai".to_owned(),
            })
        );
        assert_eq!(
            store.providers.get(&ProviderId::Google),
            Some(&ProviderCredential::ApiKey {
                api_key: "sk-google".to_owned(),
            })
        );
    }

    #[test]
    fn deleting_last_item_removes_store_entry() {
        let backend = TestBackend::default();

        set_app_secret(AppSecretKey::LocalApiToken, "token", &backend).unwrap();
        delete_app_secret(AppSecretKey::LocalApiToken, &backend).unwrap();

        assert_eq!(backend.stored_value(), None);
    }

    #[test]
    fn delete_credential_keeps_other_values() {
        let backend = TestBackend::with_value(
            r#"{
                "version": 1,
                "providers": {
                    "openai": { "type": "api_key", "apiKey": "sk-openai" },
                    "codex_oauth": {
                        "type": "oauth",
                        "accessToken": "access",
                        "refreshToken": "refresh",
                        "expiresAt": 123456,
                        "accountId": "org_123"
                    }
                },
                "licenseKey": "license"
            }"#,
        );

        delete_credential(ProviderId::Openai, &backend).unwrap();

        let store = load_credential_store(&backend).unwrap();
        assert!(!store.providers.contains_key(&ProviderId::Openai));
        assert!(store.providers.contains_key(&ProviderId::CodexOauth));
        assert_eq!(store.license_key.as_deref(), Some("license"));
    }

    #[test]
    fn set_codex_credential_validates_payload() {
        let backend = TestBackend::default();
        let error = set_codex_credential(
            CodexOAuthCredential {
                access_token: String::new(),
                refresh_token: "refresh".to_owned(),
                expires_at: 1,
                account_id: None,
            },
            &backend,
        )
        .unwrap_err();

        assert!(matches!(
            error,
            CredentialsError::InvalidCodexOAuthCredential
        ));
    }

    #[test]
    fn set_and_get_app_secret_round_trip() {
        let backend = TestBackend::default();

        set_app_secret(AppSecretKey::LicenseKey, "license", &backend).unwrap();

        let value = get_app_secret(AppSecretKey::LicenseKey, &backend).unwrap();
        assert_eq!(value.as_deref(), Some("license"));
    }
}
