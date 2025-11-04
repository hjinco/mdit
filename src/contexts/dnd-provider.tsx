import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type React from 'react'
import { useCallback } from 'react'
import { useWorkspaceStore } from '@/store/workspace-store'

type DndProviderProps = {
  children: React.ReactNode
}

// Custom collision detection: prioritize deepest depth
const depthAwareCollision: CollisionDetection = (args) => {
  const collisions = rectIntersection(args)

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

      // Try to move the entry
      const success = await moveEntry(sourcePath, destinationPath)

      if (!success) {
        console.error('Failed to move entry')
      }
    },
    [moveEntry]
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
