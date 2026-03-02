import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { dirname, resolve } from "pathe"
import { areStringArraysEqual } from "@/utils/array-utils"
import {
	hasHiddenEntryInPaths,
	isPathEqualOrDescendant,
	normalizePathSeparators,
} from "@/utils/path-utils"
import { buildWorkspaceEntries } from "../helpers/entry-helpers"
import { syncExpandedDirectoriesWithEntries } from "../helpers/expanded-directories-helpers"
import {
	filterPinsForWorkspace,
	filterPinsWithEntries,
} from "../helpers/pinned-directories-helpers"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"
import type { WorkspaceEntry } from "../workspace-state"

type VaultWatchBatch = {
	seq: number
	vaultRelCreated: string[]
	vaultRelModified: string[]
	vaultRelRemoved: string[]
	vaultRelRenamed: { fromRel: string; toRel: string }[]
	rescan: boolean
	emittedAtUnixMs: number
}

type VaultWatchBatchPayload = {
	workspacePath: string
	batch: VaultWatchBatch
}

type EnqueueBatchRefresh = (
	batch: VaultWatchBatch,
	refresh: () => Promise<void>,
) => void

type CleanupWatchSessionOptions = {
	workspacePath: string
	stopWatcher: boolean
	stopWarningMessage: string
	unlistenWarningMessage: string
}

const VAULT_WATCH_BATCH_EVENT = "vault-watch-batch"
const FS_OPERATION_COOLDOWN_MS = 5000

const collectChangedPaths = (payload: VaultWatchBatchPayload): string[] => {
	const renamedPaths = payload.batch.vaultRelRenamed.flatMap((entry) => [
		entry.fromRel,
		entry.toRel,
	])

	return [
		...payload.batch.vaultRelCreated,
		...payload.batch.vaultRelModified,
		...payload.batch.vaultRelRemoved,
		...renamedPaths,
	]
}

const isVisiblePath = (path: string): boolean => !hasHiddenEntryInPaths([path])

const collectVisibleChangedPaths = (
	payload: VaultWatchBatchPayload,
): string[] => collectChangedPaths(payload).filter(isVisiblePath)

const hasCollapsedAncestorPath = (
	path: string,
	workspacePath: string,
	collapsedSet: ReadonlySet<string>,
): boolean => {
	let currentPath = path

	while (true) {
		if (collapsedSet.has(currentPath)) {
			return true
		}

		const parentPath = normalizePathSeparators(dirname(currentPath))
		if (parentPath === currentPath) {
			return false
		}

		if (!isPathEqualOrDescendant(parentPath, workspacePath)) {
			return false
		}

		currentPath = parentPath
	}
}

export const collectRefreshDirectoryPaths = (
	workspacePath: string,
	changedRelPaths: string[],
): string[] => {
	const normalizedWorkspacePath = normalizePathSeparators(workspacePath)
	const parentPaths = new Set<string>()

	for (const relPath of changedRelPaths) {
		const absolutePath = normalizePathSeparators(
			resolve(workspacePath, relPath),
		)
		const parentPath = normalizePathSeparators(dirname(absolutePath))

		if (!isPathEqualOrDescendant(parentPath, normalizedWorkspacePath)) {
			continue
		}

		parentPaths.add(parentPath)
	}

	const sorted = Array.from(parentPaths).sort((a, b) => {
		if (a.length === b.length) {
			return a.localeCompare(b)
		}
		return a.length - b.length
	})
	const collapsed: string[] = []
	const collapsedSet = new Set<string>()

	for (const path of sorted) {
		if (hasCollapsedAncestorPath(path, normalizedWorkspacePath, collapsedSet)) {
			continue
		}

		collapsed.push(path)
		collapsedSet.add(path)
	}

	return collapsed
}

const replaceMultipleDirectoryChildren = (
	entries: WorkspaceEntry[],
	workspacePath: string,
	directoryChildrenByPath: ReadonlyMap<string, WorkspaceEntry[]>,
): WorkspaceEntry[] => {
	const normalizedWorkspacePath = normalizePathSeparators(workspacePath)
	if (directoryChildrenByPath.size === 0) {
		return entries
	}

	const normalizedDirectoryChildrenByPath = new Map<string, WorkspaceEntry[]>()
	for (const [directoryPath, children] of directoryChildrenByPath) {
		normalizedDirectoryChildrenByPath.set(
			normalizePathSeparators(directoryPath),
			children,
		)
	}

	if (normalizedDirectoryChildrenByPath.has(normalizedWorkspacePath)) {
		return normalizedDirectoryChildrenByPath.get(normalizedWorkspacePath) ?? []
	}

	let replaced = false

	const replaceInTree = (list: WorkspaceEntry[]): WorkspaceEntry[] => {
		let changed = false

		const updated = list.map((entry) => {
			if (!entry.isDirectory || !entry.children) {
				return entry
			}

			const normalizedEntryPath = normalizePathSeparators(entry.path)
			if (normalizedDirectoryChildrenByPath.has(normalizedEntryPath)) {
				replaced = true
				changed = true
				return {
					...entry,
					children:
						normalizedDirectoryChildrenByPath.get(normalizedEntryPath) ?? [],
				}
			}

			const updatedChildren = replaceInTree(entry.children)
			if (updatedChildren !== entry.children) {
				changed = true
				return {
					...entry,
					children: updatedChildren,
				}
			}

			return entry
		})

		return changed ? updated : list
	}

	const updatedEntries = replaceInTree(entries)
	return replaced ? updatedEntries : entries
}

export const replaceDirectoryChildren = (
	entries: WorkspaceEntry[],
	workspacePath: string,
	directoryPath: string,
	nextChildren: WorkspaceEntry[],
): WorkspaceEntry[] => {
	return replaceMultipleDirectoryChildren(
		entries,
		workspacePath,
		new Map([[directoryPath, nextChildren]]),
	)
}

const refreshChangedDirectories = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	directoryPaths: string[],
) => {
	if (directoryPaths.length === 0) {
		return
	}

	const directorySnapshots = await Promise.all(
		directoryPaths.map(async (directoryPath) => ({
			directoryPath,
			children: await buildWorkspaceEntries(
				directoryPath,
				ctx.deps.fileSystemRepository,
			),
		})),
	)

	if (ctx.get().workspacePath !== workspacePath) {
		return
	}

	const nextEntries = replaceMultipleDirectoryChildren(
		ctx.get().entries,
		workspacePath,
		new Map(
			directorySnapshots.map(({ directoryPath, children }) => [
				directoryPath,
				children,
			]),
		),
	)

	const state = ctx.get()
	const previousExpanded = state.expandedDirectories
	const previousPinned = state.pinnedDirectories

	const nextExpanded = syncExpandedDirectoriesWithEntries(
		previousExpanded,
		nextEntries,
	)
	const nextPinned = filterPinsWithEntries(
		filterPinsForWorkspace(previousPinned, workspacePath),
		nextEntries,
		workspacePath,
	)
	const expandedChanged = !areStringArraysEqual(previousExpanded, nextExpanded)
	const pinnedChanged = !areStringArraysEqual(previousPinned, nextPinned)

	state.updateEntries(nextEntries)

	if (expandedChanged || pinnedChanged) {
		ctx.set({
			...(expandedChanged ? { expandedDirectories: nextExpanded } : {}),
			...(pinnedChanged ? { pinnedDirectories: nextPinned } : {}),
		})
	}

	if (expandedChanged) {
		await ctx.deps.settingsRepository.persistExpandedDirectories(
			workspacePath,
			nextExpanded,
		)
	}

	if (pinnedChanged) {
		await ctx.deps.settingsRepository.persistPinnedDirectories(
			workspacePath,
			nextPinned,
		)
	}
}

const createBatchRefreshEnqueuer = (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	isActive: () => boolean,
): EnqueueBatchRefresh => {
	let refreshQueue = Promise.resolve()
	let latestQueuedBatchSeq = -1

	return (batch, refresh) => {
		if (batch.seq <= latestQueuedBatchSeq) {
			return
		}

		latestQueuedBatchSeq = batch.seq
		refreshQueue = refreshQueue
			.then(async () => {
				if (!isActive() || ctx.get().workspacePath !== workspacePath) {
					return
				}

				await refresh()
			})
			.catch((error) => {
				console.warn("Failed to process vault watch batch refresh:", {
					batchSeq: batch.seq,
					error,
				})
			})
	}
}

const hasRecentFsOperation = (ctx: WorkspaceActionContext): boolean => {
	const lastFsOpTime = ctx.get().lastFsOperationTime
	if (lastFsOpTime === null) {
		return false
	}

	return Date.now() - lastFsOpTime < FS_OPERATION_COOLDOWN_MS
}

const enqueueBatchPayloadRefresh = (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	payload: VaultWatchBatchPayload,
	enqueueBatchRefresh: EnqueueBatchRefresh,
) => {
	const visibleChangedPaths = collectVisibleChangedPaths(payload)
	if (!payload.batch.rescan && visibleChangedPaths.length === 0) {
		return
	}

	if (hasRecentFsOperation(ctx)) {
		return
	}

	if (payload.batch.rescan) {
		enqueueBatchRefresh(payload.batch, () =>
			ctx.get().refreshWorkspaceEntries(),
		)
		return
	}

	const directoryPaths = collectRefreshDirectoryPaths(
		workspacePath,
		visibleChangedPaths,
	)

	if (directoryPaths.length === 0) {
		enqueueBatchRefresh(payload.batch, () =>
			ctx.get().refreshWorkspaceEntries(),
		)
		return
	}

	enqueueBatchRefresh(payload.batch, async () => {
		try {
			await refreshChangedDirectories(ctx, workspacePath, directoryPaths)
		} catch (error) {
			console.warn(
				"Failed to apply partial workspace refresh from watch batch:",
				error,
			)
			await ctx.get().refreshWorkspaceEntries()
		}
	})
}

const stopVaultWatchCommand = async (
	workspacePath: string,
	warningMessage: string,
): Promise<void> => {
	try {
		await invoke("stop_vault_watch_command", { workspacePath })
	} catch (stopError) {
		console.warn(warningMessage, stopError)
	}
}

const unlistenVaultWatchEvent = (
	unlistenPromise: Promise<() => void>,
	warningMessage: string,
): Promise<void> => {
	return unlistenPromise
		.then((unlisten) => unlisten())
		.catch((unlistenError) => {
			console.warn(warningMessage, { unlistenError })
		})
}

const cleanupWatchSession = async (
	activeRef: { current: boolean },
	unlistenPromise: Promise<() => void>,
	options: CleanupWatchSessionOptions,
): Promise<void> => {
	activeRef.current = false

	if (options.stopWatcher) {
		await stopVaultWatchCommand(
			options.workspacePath,
			options.stopWarningMessage,
		)
	}

	await unlistenVaultWatchEvent(unlistenPromise, options.unlistenWarningMessage)
}

const deactivateCurrentWatchSession = (
	ctx: WorkspaceActionContext,
): Promise<void> => {
	const currentUnwatch = ctx.get().unwatchFn
	if (!currentUnwatch) {
		return Promise.resolve()
	}

	const cleanupPromise = Promise.resolve(currentUnwatch())

	if (ctx.get().unwatchFn === currentUnwatch) {
		ctx.set({ unwatchFn: null })
	}

	return cleanupPromise
}

export const createWorkspaceWatchActions = (
	ctx: WorkspaceActionContext,
): Pick<WorkspaceSlice, "watchWorkspace" | "unwatchWorkspace"> => ({
	watchWorkspace: async () => {
		const workspacePath = ctx.get().workspacePath
		if (!workspacePath) {
			return
		}

		await deactivateCurrentWatchSession(ctx)

		const appWindow = getCurrentWindow()
		const activeRef = { current: true }
		const enqueueBatchRefresh = createBatchRefreshEnqueuer(
			ctx,
			workspacePath,
			() => activeRef.current,
		)

		const unlistenPromise = appWindow.listen<VaultWatchBatchPayload>(
			VAULT_WATCH_BATCH_EVENT,
			(event) => {
				if (!activeRef.current) {
					return
				}

				const payload = event.payload
				if (!payload || payload.workspacePath !== workspacePath) {
					return
				}

				enqueueBatchPayloadRefresh(
					ctx,
					workspacePath,
					payload,
					enqueueBatchRefresh,
				)
			},
		)

		try {
			await invoke("start_vault_watch_command", { workspacePath })
		} catch (error) {
			await cleanupWatchSession(activeRef, unlistenPromise, {
				workspacePath,
				stopWatcher: false,
				stopWarningMessage: "Failed to stop vault watcher:",
				unlistenWarningMessage: "Failed to remove vault watch event listener:",
			})
			console.error("Failed to start vault watch command:", error)
			return
		}

		if (ctx.get().workspacePath !== workspacePath) {
			await cleanupWatchSession(activeRef, unlistenPromise, {
				workspacePath,
				stopWatcher: true,
				stopWarningMessage: "Failed to stop stale vault watcher:",
				unlistenWarningMessage: "Failed to remove stale vault watch listener:",
			})
			return
		}

		ctx.set({
			unwatchFn: () => {
				return cleanupWatchSession(activeRef, unlistenPromise, {
					workspacePath,
					stopWatcher: true,
					stopWarningMessage: "Failed to stop vault watcher:",
					unlistenWarningMessage:
						"Failed to remove vault watch event listener:",
				})
			},
		})
	},

	unwatchWorkspace: () => {
		void deactivateCurrentWatchSession(ctx)
	},
})
