import { useEffect, useEffectEvent } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

const POLL_INTERVAL_MS = 5000
const AUTO_SYNC_INTERVAL_MS = 60_000 // 1 minute

export function useGitSync(workspacePath: string | null) {
	const {
		loadGitSyncState,
		refreshGitStatus,
		performSync,
		isGitRepo,
		autoSyncEnabled,
		status,
	} = useStore(
		useShallow((state) => ({
			loadGitSyncState: state.loadGitSyncState,
			refreshGitStatus: state.refreshGitStatus,
			performSync: state.performSync,
			isGitRepo: state.gitSyncState.isGitRepo,
			autoSyncEnabled: state.gitSyncState.autoSyncEnabled,
			status: state.gitSyncState.status,
		})),
	)

	const checkAndRefresh = useEffectEvent(() => {
		if (document.hasFocus()) {
			void refreshGitStatus()
		}
	})

	const handleWindowFocus = useEffectEvent(() => {
		void refreshGitStatus()
	})

	const autoSyncIfNeeded = useEffectEvent(() => {
		if (document.hasFocus() && status === "unsynced") {
			void performSync()
		}
	})

	useEffect(() => {
		void loadGitSyncState(workspacePath)
	}, [loadGitSyncState, workspacePath])

	// Status Polling
	useEffect(() => {
		if (!workspacePath || !isGitRepo) {
			return
		}

		// Initial refresh
		checkAndRefresh()

		const pollIntervalId = window.setInterval(() => {
			checkAndRefresh()
		}, POLL_INTERVAL_MS)

		const onFocus = () => {
			handleWindowFocus()
		}

		window.addEventListener("focus", onFocus)

		return () => {
			window.clearInterval(pollIntervalId)
			window.removeEventListener("focus", onFocus)
		}
	}, [workspacePath, isGitRepo])

	// Auto Sync
	useEffect(() => {
		if (!workspacePath || !isGitRepo || !autoSyncEnabled) {
			return
		}

		const autoSyncIntervalId = window.setInterval(() => {
			autoSyncIfNeeded()
		}, AUTO_SYNC_INTERVAL_MS)

		return () => {
			window.clearInterval(autoSyncIntervalId)
		}
	}, [workspacePath, isGitRepo, autoSyncEnabled])
}
