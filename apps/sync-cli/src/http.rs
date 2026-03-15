use reqwest::blocking::Client;

use crate::auth::{
    DeviceAuthApi, DeviceCodeResponse, DeviceTokenError, DeviceTokenSuccess, SessionLookupResponse,
    DEVICE_CLIENT_ID, DEVICE_GRANT_TYPE,
};

#[derive(Debug, Clone)]
pub struct HttpApiClient {
    client: Client,
}

impl HttpApiClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }
}

impl DeviceAuthApi for HttpApiClient {
    fn request_device_code(&self, auth_url: &str) -> Result<DeviceCodeResponse, String> {
        let url = join_url(auth_url, "/api/device/code");
        let response = self
            .client
            .post(url)
            .json(&serde_json::json!({
                "client_id": DEVICE_CLIENT_ID,
            }))
            .send()
            .map_err(|error| format!("failed to request device code: {error}"))?;

        if !response.status().is_success() {
            return Err(format!(
                "device code request failed: HTTP {}",
                response.status()
            ));
        }

        response
            .json()
            .map_err(|error| format!("failed to decode device code response: {error}"))
    }

    fn exchange_device_token(
        &self,
        auth_url: &str,
        device_code: &str,
    ) -> Result<Result<DeviceTokenSuccess, DeviceTokenError>, String> {
        let url = join_url(auth_url, "/api/device/token");
        let response = self
            .client
            .post(url)
            .json(&serde_json::json!({
                "grant_type": DEVICE_GRANT_TYPE,
                "device_code": device_code,
                "client_id": DEVICE_CLIENT_ID,
            }))
            .send()
            .map_err(|error| format!("failed to exchange device token: {error}"))?;

        match response.status().as_u16() {
            200 => response
                .json()
                .map(Ok)
                .map_err(|error| format!("failed to decode device token response: {error}")),
            400 | 401 | 403 => response
                .json()
                .map(Err)
                .map_err(|error| format!("failed to decode device token error: {error}")),
            status => Err(format!("device token exchange failed: HTTP {status}")),
        }
    }

    fn resolve_user_id(&self, auth_url: &str, access_token: &str) -> Result<String, String> {
        let url = join_url(auth_url, "/api/get-session");
        let response = self
            .client
            .get(url)
            .bearer_auth(access_token)
            .send()
            .map_err(|error| format!("failed to resolve session after login: {error}"))?;

        if !response.status().is_success() {
            return Err(format!(
                "session lookup after login failed: HTTP {}",
                response.status()
            ));
        }

        let session: Option<SessionLookupResponse> = response
            .json()
            .map_err(|error| format!("failed to decode session lookup response: {error}"))?;
        session
            .map(|value| value.user.id)
            .ok_or_else(|| "session lookup returned no active session".to_string())
    }
}

fn join_url(base: &str, path: &str) -> String {
    format!("{}{}", base.trim_end_matches('/'), path)
}
