import {
	CODEX_BASE_URL,
	createMoveNoteWithAICore,
	isMarkdownPath,
	type MoveNoteWithAIBatchResult,
} from "@mdit/ai"
import { readTextFile } from "@tauri-apps/plugin-fs"
import { fetch as tauriHttpFetch } from "@tauri-apps/plugin-http"
import { basename, dirname, join } from "pathe"
import { createElement, useCallback } from "react"
import { toast } from "sonner"
import {
	AIBatchResultsToast,
	type AIBatchResultToastItem,
} from "@/components/shared/explorer-agent/ai-batch-results-toast"
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
		createSessionId: () => crypto.randomUUID(),
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

export function buildAIMoveResultToastItems(
	result: MoveNoteWithAIBatchResult,
): AIBatchResultToastItem[] {
	return result.operations
		.filter((operation) => operation.status === "moved")
		.map((operation) => {
			const destinationDirPath =
				operation.destinationDirPath ?? dirname(operation.path)

			return {
				id: operation.path,
				fromPath: operation.path,
				openPath:
					operation.newPath ??
					join(destinationDirPath, basename(operation.path)),
			}
		})
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
			let batchResult: MoveNoteWithAIBatchResult | null = null

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

				batchResult = result
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

			if (!batchResult) {
				return
			}

			const movedItems = buildAIMoveResultToastItems(batchResult)
			toast.custom(
				(toastId) =>
					createElement(AIBatchResultsToast, {
						workspacePath,
						successCount: movedCount,
						successLabel: "moved",
						unchangedCount,
						failedCount,
						emptyMessage: "No notes were moved.",
						items: movedItems,
						onOpenPath: (path: string) => {
							useStore.getState().openTab(path)
						},
						onConfirm: () => toast.dismiss(toastId),
						onUndo: async (item: AIBatchResultToastItem) => {
							const sourceDirectoryPath = dirname(item.fromPath)
							try {
								const didUndo = await useStore
									.getState()
									.moveEntry(item.openPath, sourceDirectoryPath, {
										onConflict: "fail",
									})
								if (!didUndo) {
									toast.error(
										`Failed to undo AI move for "${basename(item.fromPath)}".`,
										{ position: "bottom-left" },
									)
								}
								return didUndo
							} catch (error) {
								console.error("Failed to undo AI move:", error)
								toast.error(
									`Failed to undo AI move for "${basename(item.fromPath)}".`,
									{ position: "bottom-left" },
								)
								return false
							}
						},
					}),
				{
					position: "bottom-left",
					duration: Number.POSITIVE_INFINITY,
					closeButton: false,
				},
			)

			const summary = `AI folder move complete: moved ${movedCount}, unchanged ${unchangedCount}, failed ${failedCount}.`
			if (failedCount > 0) {
				toast.error(summary, { position: "bottom-left" })
			}
		},
		[],
	)

	return {
		moveNotesWithAI,
		canMoveNotesWithAI,
	}
}
