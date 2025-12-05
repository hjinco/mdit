import { join } from '@tauri-apps/api/path'
import { exists, rename } from '@tauri-apps/plugin-fs'
import { useCallback, useRef } from 'react'
import { useDropZone } from '@/contexts/drop-context'
import { useWorkspaceStore } from '@/store/workspace-store'
import { getFileNameFromPath } from '@/utils/path-utils'

export function useFolderDropZone({
  folderPath,
  depth,
}: {
  folderPath: string | null
  depth: number
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const { refreshWorkspaceEntries } = useWorkspaceStore()

  const setRef = useCallback((node: HTMLDivElement | null) => {
    ref.current = node
  }, [])

  const handleDrop = useCallback(
    async (paths: string[]) => {
      if (!folderPath || paths.length === 0) {
        return
      }

      try {
        // Move each file to the destination folder
        const results = await Promise.allSettled(
          paths.map(async (sourcePath) => {
            // Get the file name from source path
            const fileName = getFileNameFromPath(sourcePath)
            if (!fileName) {
              console.error('Could not extract file name from source path')
              return false
            }

            // Construct the new path
            const newPath = await join(folderPath, fileName)

            // Check if destination already has this item
            if (await exists(newPath)) {
              console.error(`Destination already contains: ${fileName}`)
              return false
            }

            // Move the file
            await rename(sourcePath, newPath)
            return true
          })
        )

        // Log any failures
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(`Failed to move file: ${paths[index]}`, result.reason)
          } else if (result.value === false) {
            console.error(`Failed to move file: ${paths[index]}`)
          }
        })

        // Refresh workspace entries to show the new files
        await refreshWorkspaceEntries()
      } catch (error) {
        console.error('Failed to move external files:', error)
      }
    },
    [folderPath, refreshWorkspaceEntries]
  )

  const { isOver } = useDropZone({
    ref,
    depth,
    onDrop: handleDrop,
  })

  return { isOver, ref: setRef }
}
