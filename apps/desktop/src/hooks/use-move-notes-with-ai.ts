import {
	CODEX_BASE_URL,
	createMoveNoteWithAICore,
	isMarkdownPath,
} from "@mdit/ai"
import { readTextFile } from "@tauri-apps/plugin-fs"
import { fetch as tauriHttpFetch } from "@tauri-apps/plugin-http"
import { useCallback } from "react"
import { toast } from "sonner"
import { useStore } from "@/store"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { normalizePathSeparators } from "@/utils/path-utils"

const moveNoteWithAICore = createMoveNoteWithAICore({
	fileSystem: {
		readTextFile,
		moveEntry: (sourcePath, destinationPath, options) =>
			useStore.getState().moveEntry(sourcePath, destinationPath, options),
	},
	codex: {
		baseURL: CODEX_BASE_URL,
		fetch: tauriHttpFetch,
	},
})

function collectCandidateDirectories(
	workspacePath: string,
	entries: WorkspaceEntry[],
): string[] {
	const directoryMap = new Map<string, string>()
	const addDirectory = (path: string) => {
		const normalizedPath = normalizePathSeparators(path)
		if (!directoryMap.has(normalizedPath)) {
			directoryMap.set(normalizedPath, path)
		}
	}

	addDirectory(workspacePath)

	const traverse = (nodes: WorkspaceEntry[]) => {
		for (const node of nodes) {
			if (!node.isDirectory) {
				continue
			}
			addDirectory(node.path)
			if (node.children) {
				traverse(node.children)
			}
		}
	}

	traverse(entries)
	return Array.from(directoryMap.values())
}

function isMarkdownEntry(entry: WorkspaceEntry) {
	return !entry.isDirectory && isMarkdownPath(entry.path)
}

export function useMoveNotesWithAI() {
	const chatConfig = useStore((state) => state.chatConfig)
	const canMoveNotesWithAI = Boolean(chatConfig)

	const moveNotesWithAI = useCallback(
		async (targetEntries: WorkspaceEntry[]) => {
			const entriesToMove = Array.from(
				new Map(
					targetEntries
						.filter((entry) => isMarkdownEntry(entry))
						.map((entry) => [entry.path, entry]),
				).values(),
			)

			if (entriesToMove.length === 0) {
				return
			}

			const { workspacePath, entries } = useStore.getState()
			if (!workspacePath) {
				return
			}

			const candidateDirectories = collectCandidateDirectories(
				workspacePath,
				entries,
			)
			if (candidateDirectories.length === 0) {
				return
			}

			const entryPaths = entriesToMove.map((entry) => entry.path)
			let movedCount = 0
			let unchangedCount = 0
			let failedCount = entriesToMove.length

			try {
				useStore.getState().lockAiEntries(entryPaths)
				await useStore.getState().refreshCodexOAuthForTarget()

				const { chatConfig: latestChatConfig } = useStore.getState()
				const result = await moveNoteWithAICore.organizeNotes({
					entries: entriesToMove,
					workspacePath,
					candidateDirectories,
					chatConfig: latestChatConfig,
				})
				if (!result) {
					return
				}

				movedCount = result.movedCount
				unchangedCount = result.unchangedCount
				failedCount = result.failedCount
				if (result.failedCount > 0) {
					const failedOperations = result.operations
						.filter((operation) => operation.status === "failed")
						.map((operation) => ({
							path: operation.path,
							destinationDirPath: operation.destinationDirPath,
							reason: operation.reason ?? "Unknown failure reason",
						}))
					console.error("AI move note failures:", failedOperations)
				}
			} catch (error) {
				console.error("Failed to process note batch move with AI:", error)
			} finally {
				useStore.getState().unlockAiEntries(entryPaths)
			}

			const summary = `AI folder move complete: moved ${movedCount}, unchanged ${unchangedCount}, failed ${failedCount}.`
			if (failedCount > 0) {
				toast.error(summary, { position: "bottom-left" })
				return
			}
			toast.success(summary, { position: "bottom-left" })
		},
		[],
	)

	return {
		moveNotesWithAI,
		canMoveNotesWithAI,
	}
}
