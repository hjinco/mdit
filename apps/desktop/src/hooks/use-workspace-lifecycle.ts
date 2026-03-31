import { useEffect, useRef } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

type WorkspaceLifecycleBootstrapPorts = {
	syncRecentWorkspacePaths: () => Promise<string[]>
	loadWorkspace: (
		workspacePath: string | null,
		options?: {
			recentWorkspacePaths?: string[]
			restoreLastOpenedFiles?: boolean
		},
	) => Promise<void>
}

export const bootstrapWorkspaceLifecycle = async (
	{ syncRecentWorkspacePaths, loadWorkspace }: WorkspaceLifecycleBootstrapPorts,
	shouldCancel?: () => boolean,
): Promise<void> => {
	const recentWorkspacePaths = await syncRecentWorkspacePaths()
	if (shouldCancel?.()) {
		return
	}
	await loadWorkspace(recentWorkspacePaths[0] ?? null, {
		recentWorkspacePaths,
		restoreLastOpenedFiles: true,
	})
}

export function useWorkspaceLifecycle() {
	const {
		workspacePath,
		syncRecentWorkspacePaths,
		loadWorkspace,
		watchWorkspace,
		unwatchWorkspace,
	} = useStore(
		useShallow((state) => ({
			workspacePath: state.workspacePath,
			syncRecentWorkspacePaths: state.syncRecentWorkspacePaths,
			loadWorkspace: state.loadWorkspace,
			watchWorkspace: state.watchWorkspace,
			unwatchWorkspace: state.unwatchWorkspace,
		})),
	)
	const hasBootstrappedRef = useRef(false)

	useEffect(() => {
		if (hasBootstrappedRef.current) {
			return
		}

		let isCancelled = false

		void bootstrapWorkspaceLifecycle(
			{
				syncRecentWorkspacePaths,
				loadWorkspace,
			},
			() => isCancelled,
		)
			.catch(async (error) => {
				console.error("Failed to bootstrap workspace lifecycle:", error)
				if (isCancelled) {
					return
				}
				await loadWorkspace(null).catch((fallbackError) => {
					console.error(
						"Failed to recover workspace lifecycle bootstrap:",
						fallbackError,
					)
				})
			})
			.finally(() => {
				if (!isCancelled) {
					hasBootstrappedRef.current = true
				}
			})

		return () => {
			isCancelled = true
		}
	}, [loadWorkspace, syncRecentWorkspacePaths])

	useEffect(() => {
		if (!workspacePath) {
			unwatchWorkspace()
			return
		}

		void watchWorkspace()

		return () => {
			unwatchWorkspace()
		}
	}, [unwatchWorkspace, watchWorkspace, workspacePath])
}
