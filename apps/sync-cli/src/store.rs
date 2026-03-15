use keyring::Entry;

const KEYRING_SERVICE: &str = "app.mdit.sync-cli";
const KEYRING_USER: &str = "sync-token";

pub trait TokenStore {
    fn load(&self) -> Result<Option<String>, String>;
    fn save(&self, token: &str) -> Result<(), String>;
}

pub struct KeyringTokenStore;

impl TokenStore for KeyringTokenStore {
    fn load(&self) -> Result<Option<String>, String> {
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|error| format!("failed to open keyring entry: {error}"))?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(format!("failed to read keyring token: {error}")),
        }
    }

    fn save(&self, token: &str) -> Result<(), String> {
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|error| format!("failed to open keyring entry: {error}"))?;
        entry
            .set_password(token)
            .map_err(|error| format!("failed to save keyring token: {error}"))
    }
}
