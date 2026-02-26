import { useEffect, useRef } from "react"

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
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		if (isOver && isDirectory && !isExpanded && hasChildren) {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
			}
			timeoutRef.current = setTimeout(() => {
				onExpand()
			}, 500)
		} else if (timeoutRef.current) {
			clearTimeout(timeoutRef.current)
			timeoutRef.current = null
		}

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
			}
		}
	}, [hasChildren, isDirectory, isExpanded, isOver, onExpand])
}
