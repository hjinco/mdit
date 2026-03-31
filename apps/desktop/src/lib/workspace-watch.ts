import type { VaultWatchBatchPayload, WorkspaceWatcher } from "@mdit/store/core"
import { VAULT_WATCH_BATCH_EVENT } from "@mdit/store/core"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"

export const createTauriWorkspaceWatcher = (): WorkspaceWatcher => ({
	start: (workspacePath: string) =>
		invoke("start_vault_watch_command", { workspacePath }),
	stop: (workspacePath: string) =>
		invoke("stop_vault_watch_command", { workspacePath }),
	subscribe: async (listener) => {
		const appWindow = getCurrentWindow()
		return appWindow.listen<VaultWatchBatchPayload>(
			VAULT_WATCH_BATCH_EVENT,
			(event) => {
				listener(event.payload)
			},
		)
	},
})
