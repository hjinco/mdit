import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { insertImage } from '@platejs/media'
import { dirname, extname, relative } from 'pathe'
import { KEYS, PathApi } from 'platejs'
import { useEditorRef } from 'platejs/react'
import type React from 'react'
import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFileExplorerSelectionStore } from '@/store/file-explorer-selection-store'
import { useTabStore } from '@/store/tab-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { isImageFile } from '@/utils/file-icon'
import { isPathEqualOrDescendant } from '@/utils/path-utils'

type DndProviderProps = {
  children: React.ReactNode
}

// Custom collision detection: prioritize deepest depth
const depthAwareCollision: CollisionDetection = (args) => {
  const collisions = pointerWithin(args)

  if (collisions.length === 0) {
    return collisions
  }

  // Sort by depth (deepest first)
  const sortedCollisions = collisions.sort((a, b) => {
    const containerA = args.droppableContainers.find((c) => c.id === a.id)
    const containerB = args.droppableContainers.find((c) => c.id === b.id)
    const depthA = containerA?.data.current?.depth ?? -1
    const depthB = containerB?.data.current?.depth ?? -1
    return depthB - depthA // Descending order (deepest first)
  })

  // Return only the deepest one
  return [sortedCollisions[0]]
}

export function DndProvider({ children }: DndProviderProps) {
  const editor = useEditorRef()
  const moveEntry = useWorkspaceStore((s) => s.moveEntry)
  const { selectedEntryPaths, resetSelection } = useFileExplorerSelectionStore(
    useShallow((state) => ({
      selectedEntryPaths: state.selectedEntryPaths,
      resetSelection: state.resetSelection,
    }))
  )

  const toRelativeImagePath = useCallback((path: string) => {
    const tabPath = useTabStore.getState().tab?.path
    if (!tabPath) {
      return path
    }

    const tabDir = dirname(tabPath)
    return relative(tabDir, path)
  }, [])

  const collectImagePaths = useCallback(
    (activeData: { path?: string; isDirectory?: boolean } | undefined) => {
      const activePath = activeData?.path
      if (!activePath || activeData?.isDirectory) {
        return []
      }

      const selection = Array.from(selectedEntryPaths)
      const candidatePaths = selection.includes(activePath)
        ? selection
        : [activePath]

      const filterImagePaths = (paths: string[]) =>
        paths.filter((path) => {
          const extension = extname(path)
          return extension ? isImageFile(extension) : false
        })

      return filterImagePaths(candidatePaths)
    },
    [selectedEntryPaths]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const overData = event.over?.data.current as
        | { kind: 'editor'; id?: string }
        | undefined
      if (overData?.kind === 'editor') {
        const activeData = event.active.data.current as
          | { path?: string; isDirectory?: boolean }
          | { id?: string }
        if ('path' in activeData) {
          const imagePaths = collectImagePaths(activeData)
          if (!overData.id || imagePaths.length === 0) {
            return
          }

          const entry = editor.api.node({
            at: [],
            block: true,
            match: (n) => (n as any).id === overData.id,
          })

          if (!entry) {
            return
          }

          const [node, path] = entry

          let nextPath = path
          // This is because the image is inserted into the code block, not after it
          if (node.type === editor.getType(KEYS.codeBlock)) {
            nextPath = PathApi.next(path)
          }

          for (const imagePath of imagePaths) {
            insertImage(editor, toRelativeImagePath(imagePath), {
              at: nextPath,
              // For other block types, `nextBlock: true` creates a new block for the image.
              // For code blocks, we've already moved to the next path, so we can insert directly.
              nextBlock: node.type !== editor.getType(KEYS.codeBlock),
            })
          }
        }
        return
      }

      const sourcePath = event.active.data.current?.path as string | undefined
      const dropZoneId = event.over?.id as string | undefined

      if (!sourcePath || !dropZoneId) {
        return
      }

      // Extract the destination path from the droppable zone id
      // Format is "droppable-{path}"
      const destinationPath = dropZoneId.replace('droppable-', '')

      if (!destinationPath || sourcePath === destinationPath) {
        return
      }

      // Check if the dragged item is part of a multi-selection
      const isSelected = selectedEntryPaths.has(sourcePath)
      const hasMultipleSelections = selectedEntryPaths.size > 1

      if (isSelected && hasMultipleSelections) {
        const selectedPaths = Array.from(selectedEntryPaths)
        // Only move top-level selections; drop descendants to preserve hierarchy
        const pathsToMove = selectedPaths.filter(
          (path) =>
            !selectedPaths.some(
              (otherPath) =>
                otherPath !== path && isPathEqualOrDescendant(path, otherPath)
            )
        )

        if (pathsToMove.length === 0) {
          return
        }

        const results = await Promise.allSettled(
          pathsToMove.map((path) => moveEntry(path, destinationPath))
        )

        // Log any failures
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(
              `Failed to move entry: ${pathsToMove[index]}`,
              result.reason
            )
          } else if (result.value === false) {
            console.error(`Failed to move entry: ${pathsToMove[index]}`)
          }
        })
      } else {
        // Move only the dragged entry (single selection or not selected)
        const success = await moveEntry(sourcePath, destinationPath)

        if (!success) {
          console.error('Failed to move entry')
        }
      }

      // Reset selection after move
      resetSelection()
    },
    [
      moveEntry,
      selectedEntryPaths,
      resetSelection,
      collectImagePaths,
      toRelativeImagePath,
      editor,
    ]
  )

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={handleDragEnd}
      collisionDetection={depthAwareCollision}
    >
      {children}
    </DndContext>
  )
}
