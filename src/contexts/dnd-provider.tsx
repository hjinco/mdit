import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type React from 'react'
import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFileExplorerSelectionStore } from '@/store/file-explorer-selection-store'
import { useWorkspaceStore } from '@/store/workspace-store'

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
  const { moveEntry } = useWorkspaceStore()
  const { selectedEntryPaths, resetSelection } = useFileExplorerSelectionStore(
    useShallow((state) => ({
      selectedEntryPaths: state.selectedEntryPaths,
      resetSelection: state.resetSelection,
    }))
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const overData = event.over?.data.current as { kind?: string } | undefined
      if (overData?.kind === 'editor') {
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
        // Move all selected entries
        const pathsToMove = Array.from(selectedEntryPaths)
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
    [moveEntry, selectedEntryPaths, resetSelection]
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
