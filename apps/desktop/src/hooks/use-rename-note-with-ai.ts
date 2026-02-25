import { CODEX_BASE_URL, createRenameNoteWithAICore } from "@mdit/ai"
import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs"
import { fetch as tauriHttpFetch } from "@tauri-apps/plugin-http"
import { useCallback, useState } from "react"
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
	const [aiRenamingEntryPaths, setAiRenamingEntryPaths] = useState<Set<string>>(
		() => new Set(),
	)
	const canRenameNoteWithAI = Boolean(chatConfig)

	const renameNoteWithAI = useCallback(async (entry: WorkspaceEntry) => {
		setAiRenamingEntryPaths((paths) => {
			const next = new Set(paths)
			next.add(entry.path)
			return next
		})

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
				.renameEntry(entry, result.finalFileName)
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
			setAiRenamingEntryPaths((paths) => {
				if (!paths.has(entry.path)) {
					return paths
				}

				const next = new Set(paths)
				next.delete(entry.path)
				return next
			})
		}
	}, [])

	return {
		renameNoteWithAI,
		aiRenamingEntryPaths,
		canRenameNoteWithAI,
	}
}
