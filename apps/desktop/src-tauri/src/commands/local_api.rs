use tauri::AppHandle;

#[tauri::command]
pub fn start_local_api_server_command(app_handle: AppHandle, token: String) -> Result<(), String> {
    crate::local_api::set_local_api_auth_token(&app_handle, token)
        .map_err(|error| format!("{error:#}"))?;
    crate::local_api::start_local_api_server(&app_handle).map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub fn set_local_api_auth_token_command(
    app_handle: AppHandle,
    token: String,
) -> Result<(), String> {
    crate::local_api::set_local_api_auth_token(&app_handle, token)
        .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub fn stop_local_api_server_command(app_handle: AppHandle) -> Result<(), String> {
    crate::local_api::shutdown_local_api_server(&app_handle);
    Ok(())
}
