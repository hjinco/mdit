import { invoke } from "@tauri-apps/api/core"
import { ensureLocalApiAuthToken } from "./local-api-auth-service"

export async function startLocalApiServer(): Promise<void> {
	const token = await ensureLocalApiAuthToken()
	await invoke("start_local_api_server_command", { token })
}

export async function stopLocalApiServer(): Promise<void> {
	await invoke("stop_local_api_server_command")
}

export async function setLocalApiAuthToken(token: string): Promise<void> {
	await invoke("set_local_api_auth_token_command", { token })
}
