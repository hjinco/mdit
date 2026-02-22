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
    sync::Mutex,
};

use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::oneshot;

const LOCAL_API_PORT: u16 = 39123;

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
    let router = router::build_router(router::LocalApiState { db_path });

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
