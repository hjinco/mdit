import { invoke } from "@tauri-apps/api/core"

export async function startLocalApiServer(): Promise<void> {
	await invoke("start_local_api_server_command")
}

export async function stopLocalApiServer(): Promise<void> {
	await invoke("stop_local_api_server_command")
}
