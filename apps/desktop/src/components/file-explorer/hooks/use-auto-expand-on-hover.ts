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
	useEffect(() => {
		if (!(isOver && isDirectory && !isExpanded && hasChildren)) {
			return
		}

		const timeoutId = setTimeout(() => {
			onExpand()
		}, 500)

		return () => {
			clearTimeout(timeoutId)
		}
	}, [hasChildren, isDirectory, isExpanded, isOver, onExpand])
}
