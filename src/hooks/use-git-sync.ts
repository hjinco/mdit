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

	// Use refs to avoid stale closures in intervals
	const statusRef = useRef(status)
	const performSyncRef = useRef(performSync)
	const refreshGitStatusRef = useRef(refreshGitStatus)

	useEffect(() => {
		statusRef.current = status
		performSyncRef.current = performSync
		refreshGitStatusRef.current = refreshGitStatus
	}, [status, performSync, refreshGitStatus])

	// Status Polling
	useEffect(() => {
		if (!workspacePath || !isGitRepo) {
			return
		}

		const checkAndRefresh = () => {
			if (document.hasFocus()) {
				refreshGitStatusRef.current()
			}
		}

		// Initial refresh
		checkAndRefresh()

		const pollIntervalId = setInterval(checkAndRefresh, POLL_INTERVAL_MS)

		const handleFocus = () => {
			refreshGitStatusRef.current()
		}

		window.addEventListener("focus", handleFocus)

		return () => {
			clearInterval(pollIntervalId)
			window.removeEventListener("focus", handleFocus)
		}
	}, [workspacePath, isGitRepo])

	// Auto Sync
	useEffect(() => {
		if (!workspacePath || !isGitRepo || !autoSyncEnabled) {
			return
		}

		const autoSyncIntervalId = setInterval(() => {
			if (document.hasFocus() && statusRef.current === "unsynced") {
				performSyncRef.current()
			}
		}, AUTO_SYNC_INTERVAL_MS)

		return () => {
			clearInterval(autoSyncIntervalId)
		}
	}, [workspacePath, isGitRepo, autoSyncEnabled])
}
