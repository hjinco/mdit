import { useEffect, useRef } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

const AUTO_INDEX_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

export function useAutoIndexing(workspacePath: string | null) {
	const {
		getIndexingConfig,
		indexWorkspace,
		config,
		isMigrationsComplete,
		ollamaModels,
		fetchOllamaModels,
	} = useStore(
		useShallow((state) => ({
			getIndexingConfig: state.getIndexingConfig,
			indexWorkspace: state.indexWorkspace,
			config: workspacePath ? state.configs[workspacePath] : null,
			isMigrationsComplete: state.isMigrationsComplete,
			ollamaModels: state.ollamaModels,
			fetchOllamaModels: state.fetchOllamaModels,
		})),
	)
	const intervalRef = useRef<number | null>(null)

	useEffect(() => {
		if (workspacePath) {
			getIndexingConfig(workspacePath).catch((error) => {
				console.error("Failed to load indexing config:", error)
			})
		}
	}, [workspacePath, getIndexingConfig])

	useEffect(() => {
		fetchOllamaModels()
	}, [fetchOllamaModels])

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

		// Function to run indexing
		const runAutoIndex = async () => {
			// Skip if indexing is already running (check current state from store)
			// Use getState() to get the latest state instead of relying on closure
			const currentState = useStore.getState().indexingState
			if (currentState[workspacePath]) {
				return
			}

			try {
				const provider = config?.embeddingProvider ?? ""
				const model = config?.embeddingModel ?? ""
				if (model && !provider) {
					// Misconfigured state; do not attempt indexing.
					return
				}
				if (model && provider && provider === "ollama") {
					const isAvailable = ollamaModels.includes(model)
					if (!isAvailable) {
						return
					}
				}
				await indexWorkspace(
					workspacePath,
					provider,
					model,
					false, // forceReindex: false for incremental updates
				)
			} catch (error) {
				// Silent failure - just log to console
				console.error("Auto-indexing failed:", error)
			}
		}

		// Run immediately on start
		runAutoIndex()

		// Set up interval for subsequent runs
		intervalRef.current = window.setInterval(
			runAutoIndex,
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
		config,
		indexWorkspace,
		isMigrationsComplete,
		ollamaModels,
	])
}
