#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpRemoteClientConfig {
    pub server_url: String,
    pub auth_token: String,
    pub user_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpSyncRemoteClient {
    config: HttpRemoteClientConfig,
}

impl HttpSyncRemoteClient {
    pub fn new(config: HttpRemoteClientConfig) -> Self {
        Self { config }
    }

    pub fn config(&self) -> &HttpRemoteClientConfig {
        &self.config
    }
}
