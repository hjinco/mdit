import { useEffect, useMemo, useState } from 'react'
import { useIndexingStore } from '@/store/indexing-store'
import { useTagStore } from '@/store/tag-store'
import type { WorkspaceEntry } from '@/store/workspace-store'

const ANIMATION_DURATION_MS = 100

export function useCollectionEntries(
  currentCollectionPath: string | null,
  entries: WorkspaceEntry[],
  workspacePath: string | null
): WorkspaceEntry[] {
  const getIndexingConfig = useIndexingStore((state) => state.getIndexingConfig)
  const indexingConfig = useIndexingStore((state) =>
    workspacePath ? (state.configs[workspacePath] ?? null) : null
  )
  const embeddingProvider = indexingConfig?.embeddingProvider ?? ''
  const embeddingModel = indexingConfig?.embeddingModel ?? ''
  const tagEntries = useTagStore((state) => state.tagEntries)
  const loadTagEntries = useTagStore((state) => state.loadTagEntries)

  useEffect(() => {
    if (workspacePath) {
      getIndexingConfig(workspacePath)
    }
  }, [workspacePath, getIndexingConfig])

  useEffect(() => {
    loadTagEntries(
      currentCollectionPath,
      workspacePath,
      embeddingProvider,
      embeddingModel
    )
  }, [
    currentCollectionPath,
    workspacePath,
    embeddingProvider,
    embeddingModel,
    loadTagEntries,
  ])

  const computedEntries = useMemo(() => {
    if (!currentCollectionPath) {
      return []
    }

    // Handle tag path: when currentCollectionPath starts with "#", it's a tag
    if (currentCollectionPath.startsWith('#')) {
      return tagEntries
    }

    // Handle root case: when currentCollectionPath is the workspace root,
    // entries already contains the root-level files
    if (workspacePath && currentCollectionPath === workspacePath) {
      return entries.filter(
        (entry) =>
          !entry.isDirectory && entry.name.toLowerCase().endsWith('.md')
      )
    }

    // Find the folder entry by path
    const findEntryByPath = (
      nodes: WorkspaceEntry[],
      targetPath: string
    ): WorkspaceEntry | null => {
      for (const node of nodes) {
        if (node.path === targetPath) {
          return node
        }
        if (node.children) {
          const found = findEntryByPath(node.children, targetPath)
          if (found) {
            return found
          }
        }
      }
      return null
    }

    const folderEntry = findEntryByPath(entries, currentCollectionPath)

    if (!folderEntry || !folderEntry.isDirectory || !folderEntry.children) {
      return []
    }

    // Return only markdown files (exclude folders and non-md files)
    return folderEntry.children.filter(
      (entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith('.md')
    )
  }, [currentCollectionPath, entries, tagEntries, workspacePath])

  const [displayedEntries, setDisplayedEntries] =
    useState<WorkspaceEntry[]>(computedEntries)

  useEffect(() => {
    if (currentCollectionPath === null) {
      // Delay clearing entries until animation completes
      const timeoutId = setTimeout(() => {
        setDisplayedEntries([])
      }, ANIMATION_DURATION_MS)

      return () => {
        clearTimeout(timeoutId)
      }
    }
    // Immediately update entries when opening
    setDisplayedEntries(computedEntries)
  }, [currentCollectionPath, computedEntries])

  return displayedEntries
}
