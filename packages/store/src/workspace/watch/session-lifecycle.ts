import type { WorkspaceActionContext } from "../workspace-action-context"
import type { CleanupWatchSessionOptions } from "./types"

const stopVaultWatchCommand = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	warningMessage: string,
): Promise<void> => {
	try {
		await ctx.deps.watcher.stop(workspacePath)
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

export const cleanupWatchSession = async (
	activeRef: { current: boolean },
	unlistenPromise: Promise<() => void>,
	options: CleanupWatchSessionOptions,
): Promise<void> => {
	activeRef.current = false

	if (options.stopWatcher) {
		await stopVaultWatchCommand(
			options.ctx,
			options.workspacePath,
			options.stopWarningMessage,
		)
	}

	await unlistenVaultWatchEvent(unlistenPromise, options.unlistenWarningMessage)
}

export const deactivateCurrentWatchSession = (
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
