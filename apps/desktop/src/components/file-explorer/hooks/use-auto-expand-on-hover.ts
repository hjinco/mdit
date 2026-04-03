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

		const timeoutId = setTimeout(onExpand, 500)

		return () => clearTimeout(timeoutId)
	}, [hasChildren, isDirectory, isExpanded, isOver, onExpand])

	useEffect(() => {
		if (!isExpanded || !manager?.dragOperation.status.initialized) {
			return
		}

		let refreshFrameId = 0
		let settleFrameId = 0

		// Auto-expand changes the subtree bounds without moving the pointer.
		// Force collision recomputation after layout settles so the expanded
		// area becomes a valid drop target immediately.
		refreshFrameId = requestAnimationFrame(() => {
			settleFrameId = requestAnimationFrame(() => {
				manager.collisionObserver.forceUpdate()
			})
		})

		return () => {
			cancelAnimationFrame(refreshFrameId)
			cancelAnimationFrame(settleFrameId)
		}
	}, [isExpanded, manager])
}
