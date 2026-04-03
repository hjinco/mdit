import { useEffect } from "react"

const AUTO_EXPAND_DELAY_MS = 800

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
		}, AUTO_EXPAND_DELAY_MS)

		return () => {
			clearTimeout(timeoutId)
		}
	}, [hasChildren, isDirectory, isExpanded, isOver, onExpand])
}
