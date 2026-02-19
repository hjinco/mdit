import { useEffect, useRef } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

const POLL_INTERVAL_MS = 5000
const AUTO_SYNC_INTERVAL_MS = 60_000 // 1 minute

export function useGitSync(workspacePath: string | null) {
	const { refreshGitStatus, performSync, isGitRepo, autoSyncEnabled, status } =
		useStore(
			useShallow((state) => ({
				refreshGitStatus: state.refreshGitStatus,
				performSync: state.performSync,
				isGitRepo: state.gitSyncState.isGitRepo,
				autoSyncEnabled: state.gitSyncState.autoSyncEnabled,
				status: state.gitSyncState.status,
			})),
		)

	// Use a ref for status to avoid stale closures in intervals
	const statusRef = useRef(status)

	useEffect(() => {
		statusRef.current = status
	}, [status])

	// Status Polling
	useEffect(() => {
		if (!workspacePath || !isGitRepo) {
			return
		}

		const checkAndRefresh = () => {
			if (document.hasFocus()) {
				refreshGitStatus()
			}
		}

		// Initial refresh
		checkAndRefresh()

		const pollIntervalId = setInterval(checkAndRefresh, POLL_INTERVAL_MS)

		window.addEventListener("focus", refreshGitStatus)

		return () => {
			clearInterval(pollIntervalId)
			window.removeEventListener("focus", refreshGitStatus)
		}
	}, [workspacePath, isGitRepo, refreshGitStatus])

	// Auto Sync
	useEffect(() => {
		if (!workspacePath || !isGitRepo || !autoSyncEnabled) {
			return
		}

		const autoSyncIntervalId = setInterval(() => {
			if (document.hasFocus() && statusRef.current === "unsynced") {
				performSync()
			}
		}, AUTO_SYNC_INTERVAL_MS)

		return () => {
			clearInterval(autoSyncIntervalId)
		}
	}, [workspacePath, isGitRepo, autoSyncEnabled, performSync])
}
