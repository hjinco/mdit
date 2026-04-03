import { useDragDropManager } from "@dnd-kit/react"
import { useEffect } from "react"

type UseAutoExpandOnHoverOptions = {
	isOver: boolean
	isDirectory: boolean
	isExpanded: boolean
	hasChildren: boolean
	onExpand: () => void
}

export function useAutoExpandOnHover({
	isOver,
	isDirectory,
	isExpanded,
	hasChildren,
	onExpand,
}: UseAutoExpandOnHoverOptions) {
	const manager = useDragDropManager()

	useEffect(() => {
		if (!(isOver && isDirectory && !isExpanded && hasChildren)) {
			return
		}

		let refreshFrameId = 0
		let settleFrameId = 0
		const timeoutId = setTimeout(() => {
			onExpand()

			// Auto-expand changes the subtree bounds without moving the pointer.
			// Refresh droppable shapes and force collision recomputation so the
			// expanded area becomes a valid drop target immediately.
			refreshFrameId = requestAnimationFrame(() => {
				settleFrameId = requestAnimationFrame(() => {
					if (!manager?.dragOperation.status.initialized) {
						return
					}

					for (const droppable of manager.registry.droppables) {
						droppable.refreshShape()
					}

					manager.collisionObserver.forceUpdate()
				})
			})
		}, 500)

		return () => {
			clearTimeout(timeoutId)
			cancelAnimationFrame(refreshFrameId)
			cancelAnimationFrame(settleFrameId)
		}
	}, [hasChildren, isDirectory, isExpanded, isOver, manager, onExpand])
}
