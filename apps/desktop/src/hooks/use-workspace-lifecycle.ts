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

		hasBootstrappedRef.current = true
		let isCancelled = false

		void (async () => {
			if (isCancelled) {
				return
			}

			await bootstrapWorkspaceLifecycle(
				{
					syncRecentWorkspacePaths,
					loadWorkspace,
				},
				() => isCancelled,
			)
		})().catch((error) => {
			console.error("Failed to bootstrap workspace lifecycle:", error)
			void loadWorkspace(null)
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
