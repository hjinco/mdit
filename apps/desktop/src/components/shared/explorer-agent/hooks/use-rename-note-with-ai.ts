import {
	CODEX_BASE_URL,
	createRenameNoteWithAICore,
	isMarkdownPath,
} from "@mdit/ai"
import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs"
import { fetch as tauriHttpFetch } from "@tauri-apps/plugin-http"
import { basename, dirname } from "pathe"
import { createElement, useCallback } from "react"
import { toast } from "sonner"
import {
	AIBatchResultsToast,
	type AIBatchResultToastItem,
} from "@/components/shared/explorer-agent/ai-batch-results-toast"
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
		createSessionId: () => crypto.randomUUID(),
	},
})

function isMarkdownEntry(entry: WorkspaceEntry) {
	return !entry.isDirectory && isMarkdownPath(entry.path)
}

function areEntriesInSameDirectory(entries: WorkspaceEntry[]) {
	if (entries.length === 0) {
		return false
	}
	const directoryPath = dirname(entries[0].path)
	return entries.every((entry) => dirname(entry.path) === directoryPath)
}

type AppliedRenameOperation = {
	path: string
	status: "renamed" | "unchanged" | "failed"
	finalFileName?: string
	newPath?: string
	reason?: string
}

type AppliedRenameBatchResult = {
	renamedCount: number
	unchangedCount: number
	failedCount: number
	operations: AppliedRenameOperation[]
	dirPath: string
}

function buildAppliedBatchResult({
	dirPath,
	operations,
}: {
	dirPath: string
	operations: AppliedRenameOperation[]
}): AppliedRenameBatchResult {
	const { renamedCount, unchangedCount, failedCount } = operations.reduce(
		(acc, operation) => {
			if (operation.status === "renamed") {
				acc.renamedCount += 1
			} else if (operation.status === "unchanged") {
				acc.unchangedCount += 1
			} else if (operation.status === "failed") {
				acc.failedCount += 1
			}
			return acc
		},
		{
			renamedCount: 0,
			unchangedCount: 0,
			failedCount: 0,
		},
	)

	return {
		renamedCount,
		unchangedCount,
		failedCount,
		operations,
		dirPath,
	}
}

export function buildAIRenameResultToastItems(
	result: AppliedRenameBatchResult,
): AIBatchResultToastItem[] {
	return result.operations
		.filter(
			(operation): operation is AppliedRenameOperation & { newPath: string } =>
				operation.status === "renamed" && typeof operation.newPath === "string",
		)
		.map((operation) => ({
			id: operation.path,
			fromPath: operation.path,
			openPath: operation.newPath,
		}))
}

export function useRenameNoteWithAI() {
	const chatConfig = useStore((state) => state.chatConfig)
	const canRenameNoteWithAI = Boolean(chatConfig)

	const renameNotesWithAI = useCallback(
		async (targetEntries: WorkspaceEntry[]) => {
			const entriesToRename = Array.from(
				new Map(
					targetEntries
						.filter((entry) => isMarkdownEntry(entry))
						.map((entry) => [entry.path, entry]),
				).values(),
			)

			if (
				entriesToRename.length === 0 ||
				!areEntriesInSameDirectory(entriesToRename)
			) {
				return
			}

			const entryPaths = entriesToRename.map((entry) => entry.path)
			const entryByPath = new Map(
				entriesToRename.map((entry) => [entry.path, entry]),
			)
			let batchResult: AppliedRenameBatchResult | null = null

			try {
				useStore.getState().lockAiEntries(entryPaths)
				await useStore.getState().refreshCodexOAuthForTarget()
				const { chatConfig: latestChatConfig } = useStore.getState()

				const suggestionResult = await renameNoteWithAICore.suggestRename({
					entries: entriesToRename,
					chatConfig: latestChatConfig,
				})
				if (!suggestionResult) {
					return
				}

				const appliedOperations: AppliedRenameOperation[] = []
				for (const operation of suggestionResult.operations) {
					if (operation.status !== "renamed" || !operation.finalFileName) {
						appliedOperations.push({
							path: operation.path,
							status: operation.status,
							finalFileName: operation.finalFileName,
							reason: operation.reason,
						})
						continue
					}

					const entry = entryByPath.get(operation.path)
					if (!entry) {
						appliedOperations.push({
							path: operation.path,
							status: "failed",
							reason: "Could not resolve rename target entry.",
						})
						continue
					}

					try {
						const renamedPath = await useStore
							.getState()
							.renameEntry(entry, operation.finalFileName, {
								allowLockedSourcePath: true,
							})
						if (renamedPath === operation.path) {
							appliedOperations.push({
								path: operation.path,
								status: "failed",
								finalFileName: operation.finalFileName,
								reason: "Failed to rename note in the filesystem.",
							})
							continue
						}

						appliedOperations.push({
							path: operation.path,
							status: "renamed",
							finalFileName: basename(renamedPath),
							newPath: renamedPath,
						})
					} catch (error) {
						appliedOperations.push({
							path: operation.path,
							status: "failed",
							finalFileName: operation.finalFileName,
							reason:
								error instanceof Error
									? error.message
									: "Failed to rename note in the filesystem.",
						})
					}
				}

				batchResult = buildAppliedBatchResult({
					dirPath: suggestionResult.dirPath,
					operations: appliedOperations,
				})
				if (batchResult.failedCount > 0) {
					const failedOperations = batchResult.operations
						.filter((operation) => operation.status === "failed")
						.map((operation) => ({
							path: operation.path,
							reason: operation.reason ?? "Unknown failure reason",
						}))
					console.error("AI rename note failures:", failedOperations)
				}
			} catch (error) {
				console.error("Failed to process note batch rename with AI:", error)
				toast.error("Failed to process note batch rename with AI.", {
					position: "bottom-left",
				})
			} finally {
				useStore.getState().unlockAiEntries(entryPaths)
			}

			if (!batchResult) {
				return
			}

			const renamedItems = buildAIRenameResultToastItems(batchResult)
			const { renamedCount, unchangedCount, failedCount } = batchResult
			const { workspacePath } = useStore.getState()
			toast.custom(
				(toastId) =>
					createElement(AIBatchResultsToast, {
						workspacePath,
						successCount: renamedCount,
						successLabel: "renamed",
						unchangedCount,
						failedCount,
						emptyMessage: "No notes were renamed.",
						items: renamedItems,
						onOpenPath: (path: string) => {
							useStore.getState().openTab(path)
						},
						onConfirm: () => toast.dismiss(toastId),
						onUndo: async (item: AIBatchResultToastItem) => {
							const sourceName = basename(item.fromPath)
							try {
								const revertedPath = await useStore.getState().renameEntry(
									{
										path: item.openPath,
										name: basename(item.openPath),
										isDirectory: false,
									},
									sourceName,
								)
								const didUndo = revertedPath === item.fromPath
								if (!didUndo) {
									toast.error(`Failed to undo AI rename for "${sourceName}".`, {
										position: "bottom-left",
									})
								}
								return didUndo
							} catch (error) {
								console.error("Failed to undo AI rename:", error)
								toast.error(`Failed to undo AI rename for "${sourceName}".`, {
									position: "bottom-left",
								})
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

			const summary = `AI rename complete: renamed ${renamedCount}, unchanged ${unchangedCount}, failed ${failedCount}.`
			if (failedCount > 0) {
				toast.error(summary, { position: "bottom-left" })
			}
		},
		[],
	)

	const renameNoteWithAI = useCallback(
		async (entry: WorkspaceEntry) => {
			await renameNotesWithAI([entry])
		},
		[renameNotesWithAI],
	)

	return {
		renameNotesWithAI,
		renameNoteWithAI,
		canRenameNoteWithAI,
	}
}
