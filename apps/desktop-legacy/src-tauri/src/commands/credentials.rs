use mdit_credentials::{
    delete_app_secret, delete_credential, get_app_secret, get_credential,
    list_credential_providers, set_api_key_credential, set_app_secret, set_codex_credential,
    ApiKeyProviderId, AppSecretKey, CodexOAuthCredential, CredentialStoreBackend,
    ProviderCredential, ProviderId,
};
use tauri::{AppHandle, Runtime};
use tauri_plugin_keyring::KeyringExt;

struct TauriKeyringBackend<'a, R: Runtime> {
    app_handle: &'a AppHandle<R>,
}

impl<R: Runtime> CredentialStoreBackend for TauriKeyringBackend<'_, R> {
    fn get_password(&self, service: &str, user: &str) -> Result<Option<String>, String> {
        self.app_handle
            .keyring()
            .get_password(service, user)
            .map_err(|error| error.to_string())
    }

    fn set_password(&self, service: &str, user: &str, password: &str) -> Result<(), String> {
        self.app_handle
            .keyring()
            .set_password(service, user, password)
            .map_err(|error| error.to_string())
    }

    fn delete_password(&self, service: &str, user: &str) -> Result<(), String> {
        self.app_handle
            .keyring()
            .delete_password(service, user)
            .map_err(|error| error.to_string())
    }
}

fn backend<R: Runtime>(app_handle: &AppHandle<R>) -> TauriKeyringBackend<'_, R> {
    TauriKeyringBackend { app_handle }
}

#[tauri::command]
pub fn list_credential_providers_command<R: Runtime>(
    app_handle: AppHandle<R>,
) -> Result<Vec<ProviderId>, String> {
    list_credential_providers(&backend(&app_handle)).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_credential_command<R: Runtime>(
    app_handle: AppHandle<R>,
    provider_id: ProviderId,
) -> Result<Option<ProviderCredential>, String> {
    get_credential(provider_id, &backend(&app_handle)).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_api_key_credential_command<R: Runtime>(
    app_handle: AppHandle<R>,
    provider_id: ApiKeyProviderId,
    api_key: String,
) -> Result<(), String> {
    set_api_key_credential(provider_id, &api_key, &backend(&app_handle))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_codex_credential_command<R: Runtime>(
    app_handle: AppHandle<R>,
    credential: CodexOAuthCredential,
) -> Result<(), String> {
    set_codex_credential(credential, &backend(&app_handle)).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_credential_command<R: Runtime>(
    app_handle: AppHandle<R>,
    provider_id: ProviderId,
) -> Result<(), String> {
    delete_credential(provider_id, &backend(&app_handle)).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_app_secret_command<R: Runtime>(
    app_handle: AppHandle<R>,
    key: AppSecretKey,
) -> Result<Option<String>, String> {
    get_app_secret(key, &backend(&app_handle)).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_app_secret_command<R: Runtime>(
    app_handle: AppHandle<R>,
    key: AppSecretKey,
    value: String,
) -> Result<(), String> {
    set_app_secret(key, &value, &backend(&app_handle)).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_app_secret_command<R: Runtime>(
    app_handle: AppHandle<R>,
    key: AppSecretKey,
) -> Result<(), String> {
    delete_app_secret(key, &backend(&app_handle)).map_err(|error| error.to_string())
}
