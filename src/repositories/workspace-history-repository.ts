import { invoke } from "@tauri-apps/api/core"

export class WorkspaceHistoryRepository {
	async listWorkspacePaths(): Promise<string[]> {
		return invoke<string[]>("list_vault_workspaces_command")
	}

	async touchWorkspace(path: string): Promise<void> {
		await invoke<void>("touch_vault_workspace_command", {
			workspacePath: path,
		})
	}

	async removeWorkspace(path: string): Promise<void> {
		await invoke<void>("remove_vault_workspace_command", {
			workspacePath: path,
		})
	}
}
