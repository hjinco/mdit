import { useEffect, useRef } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

const AUTO_INDEX_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

export function useAutoIndexing(workspacePath: string | null) {
	const {
		indexVaultDocuments,
		refreshWorkspaceEmbeddings,
		isMigrationsComplete,
	} = useStore(
		useShallow((state) => ({
			indexVaultDocuments: state.indexVaultDocuments,
			refreshWorkspaceEmbeddings: state.refreshWorkspaceEmbeddings,
			isMigrationsComplete: state.isMigrationsComplete,
		})),
	)
	const intervalRef = useRef<number | null>(null)

	useEffect(() => {
		// Clear any existing interval
		if (intervalRef.current !== null) {
			window.clearInterval(intervalRef.current)
			intervalRef.current = null
		}

		// Start auto-indexing once workspace and migrations are ready.
		if (!workspacePath || !isMigrationsComplete) {
			return
		}

		const isIndexingRunning = () => useStore.getState().isIndexing

		const runInitialIndex = async () => {
			if (isIndexingRunning()) {
				return
			}

			try {
				await indexVaultDocuments(workspacePath, false)
			} catch (error) {
				console.error("Initial auto-indexing failed:", error)
			}
		}

		const runEmbeddingRefresh = async () => {
			// Skip if indexing is already running (check current state from store)
			// Use getState() to get the latest state instead of relying on closure
			if (isIndexingRunning()) {
				return
			}

			try {
				await refreshWorkspaceEmbeddings(workspacePath)
			} catch (error) {
				// Silent failure - just log to console
				console.error("Auto-indexing failed:", error)
			}
		}

		// Seed document rows and embeddings once on startup before background refreshes.
		void runInitialIndex()

		// Set up interval for subsequent runs
		intervalRef.current = window.setInterval(
			runEmbeddingRefresh,
			AUTO_INDEX_INTERVAL_MS,
		)

		// Cleanup function
		return () => {
			if (intervalRef.current !== null) {
				window.clearInterval(intervalRef.current)
				intervalRef.current = null
			}
		}
	}, [
		workspacePath,
		indexVaultDocuments,
		refreshWorkspaceEmbeddings,
		isMigrationsComplete,
	])
}
