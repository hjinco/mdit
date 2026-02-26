import { CODEX_BASE_URL, createRenameNoteWithAICore } from "@mdit/ai"
import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs"
import { fetch as tauriHttpFetch } from "@tauri-apps/plugin-http"
import { useCallback } from "react"
import { toast } from "sonner"
import { useStore } from "@/store"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"

const renameNoteWithAICore = createRenameNoteWithAICore({
	fileSystem: {
		exists,
		readDir,
		readTextFile,
	},
	codex: {
		baseURL: CODEX_BASE_URL,
		fetch: tauriHttpFetch,
	},
})

export function useRenameNoteWithAI() {
	const chatConfig = useStore((state) => state.chatConfig)
	const canRenameNoteWithAI = Boolean(chatConfig)

	const renameNoteWithAI = useCallback(async (entry: WorkspaceEntry) => {
		useStore.getState().lockAiEntries([entry.path])
		try {
			await useStore.getState().refreshCodexOAuthForTarget()
			const { chatConfig: latestChatConfig } = useStore.getState()

			const result = await renameNoteWithAICore.suggestRename({
				entry,
				chatConfig: latestChatConfig,
			})

			if (!result) {
				return
			}

			const renamedPath = await useStore
				.getState()
				.renameEntry(entry, result.finalFileName, {
					allowLockedSourcePath: true,
				})
			const currentTabPath = useStore.getState().tab?.path

			toast.success(`Renamed note to "${result.finalFileName}"`, {
				position: "bottom-left",
				action:
					currentTabPath === renamedPath
						? undefined
						: {
								label: "Open",
								onClick: () => {
									useStore.getState().openTab(renamedPath)
								},
							},
			})
		} catch (error) {
			toast.error(`Failed to rename note with AI`, {
				position: "bottom-left",
			})
			console.error("Failed to rename note with AI:", error)
		} finally {
			useStore.getState().unlockAiEntries([entry.path])
		}
	}, [])

	return {
		renameNoteWithAI,
		canRenameNoteWithAI,
	}
}
