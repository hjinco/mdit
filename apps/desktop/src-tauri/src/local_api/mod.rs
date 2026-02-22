mod mcp_sdk_server;
mod router;

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests_mcp;
#[cfg(test)]
mod tests_rest;

use std::{
    error::Error as StdError,
    io,
    net::{Ipv4Addr, SocketAddrV4, TcpListener},
    sync::{Arc, Mutex, RwLock},
};

use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::oneshot;

const LOCAL_API_PORT: u16 = 39123;
const LOCAL_API_AUTH_TOKEN_MIN_LENGTH: usize = 32;

#[derive(Default)]
pub struct LocalApiAuthState {
    token: Arc<RwLock<String>>,
}

impl LocalApiAuthState {
    pub fn set_token(&self, token: String) -> Result<(), io::Error> {
        let normalized = token.trim().to_string();
        if normalized.len() < LOCAL_API_AUTH_TOKEN_MIN_LENGTH {
            return Err(io::Error::other(format!(
                "Local API token must be at least {LOCAL_API_AUTH_TOKEN_MIN_LENGTH} characters long"
            )));
        }

        let mut guard = self.token.write().map_err(|error| {
            io::Error::other(format!(
                "Failed to lock local API auth token for write: {error}"
            ))
        })?;
        *guard = normalized;
        Ok(())
    }

    pub fn shared_token(&self) -> Arc<RwLock<String>> {
        Arc::clone(&self.token)
    }

    fn has_token(&self) -> Result<bool, io::Error> {
        let guard = self.token.read().map_err(|error| {
            io::Error::other(format!(
                "Failed to lock local API auth token for read: {error}"
            ))
        })?;
        Ok(!guard.is_empty())
    }
}

pub struct LocalApiRuntime {
    shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl LocalApiRuntime {
    pub fn shutdown(&self) {
        if let Some(shutdown_tx) = self.shutdown_tx.lock().ok().and_then(|mut tx| tx.take()) {
            let _ = shutdown_tx.send(());
        }
    }
}

pub struct LocalApiRuntimeState {
    runtime: Mutex<Option<LocalApiRuntime>>,
}

impl Default for LocalApiRuntimeState {
    fn default() -> Self {
        Self {
            runtime: Mutex::new(None),
        }
    }
}

fn create_local_api_runtime<R: Runtime>(
    app_handle: &AppHandle<R>,
) -> Result<LocalApiRuntime, Box<dyn StdError>> {
    let db_path = crate::persistence::run_app_migrations_anyhow(app_handle)?;
    let auth_token = app_handle.state::<LocalApiAuthState>().shared_token();
    let router = router::build_router(router::LocalApiState {
        db_path,
        auth_token,
    });

    let bind_addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, LOCAL_API_PORT);
    let std_listener = TcpListener::bind(bind_addr).map_err(|error| {
        io::Error::other(format!(
            "Failed to bind local API server on {bind_addr}: {error}"
        ))
    })?;
    std_listener.set_nonblocking(true).map_err(|error| {
        io::Error::other(format!(
            "Failed to configure local API socket on {bind_addr}: {error}"
        ))
    })?;

    let (shutdown_tx, shutdown_rx) = oneshot::channel();

    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::from_std(std_listener) {
            Ok(l) => l,
            Err(e) => {
                eprintln!(
                    "Failed to create async listener for local API server on {bind_addr}: {e}"
                );
                return;
            }
        };

        let server = axum::serve(listener, router).with_graceful_shutdown(async {
            let _ = shutdown_rx.await;
        });

        if let Err(error) = server.await {
            eprintln!("Local API server stopped with an error: {error}");
        }
    });

    eprintln!("Local API server started at http://127.0.0.1:{LOCAL_API_PORT}");

    Ok(LocalApiRuntime {
        shutdown_tx: Mutex::new(Some(shutdown_tx)),
    })
}

pub fn start_local_api_server<R: Runtime>(
    app_handle: &AppHandle<R>,
) -> Result<(), Box<dyn StdError>> {
    if !app_handle.state::<LocalApiAuthState>().has_token()? {
        return Err(io::Error::other(
            "Local API auth token is not configured. Set token before starting the server.",
        )
        .into());
    }

    let runtime_state = app_handle.state::<LocalApiRuntimeState>();
    let mut guard = runtime_state.runtime.lock().map_err(|error| {
        io::Error::other(format!("Failed to lock local API runtime state: {error}"))
    })?;

    if guard.is_some() {
        return Ok(());
    }

    *guard = Some(create_local_api_runtime(app_handle)?);

    Ok(())
}

pub fn set_local_api_auth_token<R: Runtime>(
    app_handle: &AppHandle<R>,
    token: String,
) -> Result<(), Box<dyn StdError>> {
    let auth_state = app_handle.state::<LocalApiAuthState>();
    auth_state.set_token(token)?;
    Ok(())
}

pub fn shutdown_local_api_server<R: Runtime>(app_handle: &AppHandle<R>) {
    if let Some(runtime_state) = app_handle.try_state::<LocalApiRuntimeState>() {
        if let Ok(mut guard) = runtime_state.runtime.lock() {
            if let Some(runtime) = guard.take() {
                runtime.shutdown();
            }
        }
    }
}

pub fn handle_run_event<R: Runtime>(app_handle: &AppHandle<R>, event: &tauri::RunEvent) {
    match event {
        tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
            shutdown_local_api_server(app_handle);
        }
        _ => {}
    }
}
