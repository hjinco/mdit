import { resolve } from "pathe"
import {
	hasHiddenEntryInPaths,
	isPathEqualOrDescendant,
	normalizePathSeparators,
} from "@/utils/path-utils"
import { reconcileWorkspaceTreeFromFallback } from "../tree/reconcile"
import type { WorkspaceActionContext } from "../workspace-action-context"
import { applyWatchBatchChanges } from "./batch-apply"
import { collapseDirectoryPaths } from "./tree-patch"
import type {
	EnqueueBatchRefresh,
	VaultWatchBatch,
	VaultWatchBatchPayload,
	VaultWatchOp,
} from "./types"

const collectChangedPaths = (ops: VaultWatchOp[]): string[] => {
	return ops.flatMap((op) => {
		if (op.type === "move") {
			return [op.fromRel, op.toRel]
		}
		if (op.type === "pathState") {
			return [op.relPath]
		}
		if (op.type === "scanTree") {
			return [op.relPrefix]
		}
		return []
	})
}

const isVisiblePath = (path: string): boolean => !hasHiddenEntryInPaths([path])

const hasFullRescan = (batch: VaultWatchBatch): boolean =>
	batch.ops.some((op) => op.type === "fullRescan")

const incrementalOps = (batch: VaultWatchBatch): VaultWatchOp[] =>
	batch.ops.filter((op) => op.type === "pathState" || op.type === "move")

const collectVisibleIncrementalPaths = (batch: VaultWatchBatch): string[] =>
	collectChangedPaths(incrementalOps(batch)).filter(isVisiblePath)

const collectScanTreeRefreshPaths = (
	workspacePath: string,
	batch: VaultWatchBatch,
): { directoryPaths: string[]; requiresFullRefresh: boolean } => {
	const normalizedWorkspacePath = normalizePathSeparators(workspacePath)
	const directoryPaths = new Set<string>()
	let requiresFullRefresh = false

	for (const op of batch.ops) {
		if (op.type !== "scanTree" || !isVisiblePath(op.relPrefix)) {
			continue
		}

		const absolutePath = normalizePathSeparators(
			resolve(workspacePath, op.relPrefix),
		)
		if (!isPathEqualOrDescendant(absolutePath, normalizedWorkspacePath)) {
			requiresFullRefresh = true
			continue
		}

		directoryPaths.add(absolutePath)
	}

	return {
		directoryPaths: collapseDirectoryPaths(
			normalizedWorkspacePath,
			Array.from(directoryPaths),
		),
		requiresFullRefresh,
	}
}

export const createBatchRefreshEnqueuer = (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	isActive: () => boolean,
): EnqueueBatchRefresh => {
	let refreshQueue = Promise.resolve()
	let latestStreamId: string | null = null
	let latestQueuedBatchSeq = -1

	return (batch, refresh) => {
		if (latestStreamId !== batch.streamId) {
			latestStreamId = batch.streamId
			latestQueuedBatchSeq = -1
		}

		if (batch.seqInStream <= latestQueuedBatchSeq) {
			return
		}

		latestQueuedBatchSeq = batch.seqInStream
		refreshQueue = refreshQueue
			.then(async () => {
				if (!isActive() || ctx.get().workspacePath !== workspacePath) {
					return
				}

				await refresh()
			})
			.catch((error) => {
				console.warn("Failed to process vault watch batch refresh:", {
					streamId: batch.streamId,
					batchSeqInStream: batch.seqInStream,
					error,
				})
			})
	}
}

export const enqueueBatchPayloadRefresh = (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	payload: VaultWatchBatchPayload,
	enqueueBatchRefresh: EnqueueBatchRefresh,
) => {
	if (hasFullRescan(payload.batch)) {
		enqueueBatchRefresh(payload.batch, () =>
			ctx.get().refreshWorkspaceEntries(),
		)
		return
	}

	const scanTreeRefresh = collectScanTreeRefreshPaths(
		workspacePath,
		payload.batch,
	)
	const visibleChangedPaths = collectVisibleIncrementalPaths(payload.batch)
	const externalRelPaths =
		visibleChangedPaths.length === 0
			? []
			: ctx.runtime.originJournal.resolve({
					workspacePath,
					relPaths: visibleChangedPaths,
				}).externalRelPaths

	if (
		externalRelPaths.length === 0 &&
		scanTreeRefresh.directoryPaths.length === 0 &&
		!scanTreeRefresh.requiresFullRefresh
	) {
		return
	}

	enqueueBatchRefresh(payload.batch, async () => {
		try {
			let fallbackDirectoryPaths = scanTreeRefresh.directoryPaths
			let requiresFullRefresh = scanTreeRefresh.requiresFullRefresh

			if (externalRelPaths.length > 0) {
				const incrementalResult = await applyWatchBatchChanges(ctx, {
					workspacePath,
					ops: incrementalOps(payload.batch),
					externalRelPaths,
				})
				fallbackDirectoryPaths = collapseDirectoryPaths(workspacePath, [
					...fallbackDirectoryPaths,
					...incrementalResult.fallbackDirectoryPaths,
				])
				requiresFullRefresh ||= incrementalResult.requiresFullRefresh
			}

			await reconcileWorkspaceTreeFromFallback(ctx, {
				workspacePath,
				fallbackDirectoryPaths,
				requiresFullRefresh,
			})
		} catch (error) {
			console.warn(
				"Failed to apply workspace watch batch incrementally:",
				error,
			)
			await ctx.get().refreshWorkspaceEntries()
		}
	})
}
