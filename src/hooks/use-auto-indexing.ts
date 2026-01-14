import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/shallow'
import { useStore } from '@/store'
import { useIndexingStore } from '@/store/indexing-store'

const AUTO_INDEX_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

export function useAutoIndexing(workspacePath: string | null) {
  const { getIndexingConfig, indexWorkspace, config } = useIndexingStore(
    useShallow((state) => ({
      getIndexingConfig: state.getIndexingConfig,
      indexWorkspace: state.indexWorkspace,
      config: workspacePath ? state.configs[workspacePath] : null,
    }))
  )
  const isMigrationsComplete = useStore((state) => state.isMigrationsComplete)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (workspacePath) {
      getIndexingConfig(workspacePath).catch((error) => {
        console.error('Failed to load indexing config:', error)
      })
    }
  }, [workspacePath, getIndexingConfig])

  // biome-ignore lint/correctness/useExhaustiveDependencies: we want to run the effect when config or migrations complete status changes
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // Check if we should start auto-indexing
    // Wait for migrations to complete before starting indexing
    if (!workspacePath || !config || !isMigrationsComplete) {
      return
    }

    if (!config.autoIndex) {
      return
    }

    // Function to run indexing
    const runAutoIndex = async () => {
      // Skip if indexing is already running (check current state from store)
      // Use getState() to get the latest state instead of relying on closure
      const currentState = useIndexingStore.getState().indexingState
      if (currentState[workspacePath]) {
        return
      }

      try {
        await indexWorkspace(
          workspacePath,
          config.embeddingProvider,
          config.embeddingModel,
          false // forceReindex: false for incremental updates
        )
      } catch (error) {
        // Silent failure - just log to console
        console.error('Auto-indexing failed:', error)
      }
    }

    // Run immediately on start
    runAutoIndex()

    // Set up interval for subsequent runs
    intervalRef.current = window.setInterval(
      runAutoIndex,
      AUTO_INDEX_INTERVAL_MS
    )

    // Cleanup function
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [config, indexWorkspace, isMigrationsComplete])
}
