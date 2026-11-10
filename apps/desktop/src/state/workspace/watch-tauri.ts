import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import type { VaultWatchBatchPayload, WorkspaceWatcher } from "./watch-types"

const VAULT_WATCH_BATCH_EVENT = "vault-watch-batch"

export const createTauriWorkspaceWatcher = (): WorkspaceWatcher => ({
	start: (lease) => invoke("start_vault_watch_command", lease),
	stop: (lease) => invoke("stop_vault_watch_command", lease),
	subscribe: (listener) =>
		getCurrentWindow().listen<VaultWatchBatchPayload>(
			VAULT_WATCH_BATCH_EVENT,
			(event) => listener(event.payload),
		),
})
