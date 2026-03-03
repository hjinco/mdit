import { hasHiddenEntryInPaths } from "@/utils/path-utils"
import { reconcileWorkspaceTreeFromFallback } from "../actions/workspace-tree-reconcile"
import type { WorkspaceActionContext } from "../workspace-action-context"
import { applyWatchBatchChanges } from "./batch-apply"
import type { EnqueueBatchRefresh, VaultWatchBatchPayload } from "./types"

const collectChangedPaths = (payload: VaultWatchBatchPayload): string[] => {
	return payload.batch.changes.flatMap((change) => {
		if (change.type === "moved") {
			return [change.fromRel, change.toRel]
		}
		return [change.relPath]
	})
}

const isVisiblePath = (path: string): boolean => !hasHiddenEntryInPaths([path])

const collectVisibleChangedPaths = (
	payload: VaultWatchBatchPayload,
): string[] => collectChangedPaths(payload).filter(isVisiblePath)

export const createBatchRefreshEnqueuer = (
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

export const enqueueBatchPayloadRefresh = (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	payload: VaultWatchBatchPayload,
	enqueueBatchRefresh: EnqueueBatchRefresh,
) => {
	const visibleChangedPaths = collectVisibleChangedPaths(payload)
	if (!payload.batch.rescan && visibleChangedPaths.length === 0) {
		return
	}

	if (payload.batch.rescan) {
		enqueueBatchRefresh(payload.batch, () =>
			ctx.get().refreshWorkspaceEntries(),
		)
		return
	}

	const { externalRelPaths } = ctx.originJournal.resolve({
		workspacePath,
		relPaths: visibleChangedPaths,
	})
	if (externalRelPaths.length === 0) {
		return
	}

	enqueueBatchRefresh(payload.batch, async () => {
		try {
			const { fallbackDirectoryPaths, requiresFullRefresh } =
				await applyWatchBatchChanges(ctx, {
					workspacePath,
					changes: payload.batch.changes,
					externalRelPaths,
				})

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
