import type { Virtualizer } from "@tanstack/react-virtual"
import { useEffect, useRef } from "react"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"

type Params = {
	currentCollectionPath: string | null
	sortedEntries: WorkspaceEntry[]
	tabPath?: string
	virtualizer: Virtualizer<HTMLDivElement, Element>
}

/**
 * When notes are added to the current collection, scrolls to the new item
 * so it is visible (prefers the active tab's path when available).
 */
export function useScrollToNewEntry({
	currentCollectionPath,
	sortedEntries,
	tabPath,
	virtualizer,
}: Params) {
	const previousPathsRef = useRef<string[]>([])
	const previousCollectionPathRef = useRef<string | null>(null)

	useEffect(() => {
		const isCollectionChanged =
			previousCollectionPathRef.current !== currentCollectionPath
		const previousPaths = isCollectionChanged ? [] : previousPathsRef.current
		const currentPaths = sortedEntries.map((entry) => entry.path)
		const newlyAddedPaths = currentPaths.filter(
			(path) => !previousPaths.includes(path),
		)

		previousCollectionPathRef.current = currentCollectionPath
		previousPathsRef.current = currentPaths

		if (isCollectionChanged || newlyAddedPaths.length === 0) {
			return
		}

		const targetPath =
			tabPath && newlyAddedPaths.includes(tabPath)
				? tabPath
				: newlyAddedPaths[0]
		const targetIndex = currentPaths.indexOf(targetPath)

		if (targetIndex !== -1) {
			const behavior: ScrollBehavior =
				sortedEntries.length <= 100 ? "smooth" : "auto"
			virtualizer.scrollToIndex(targetIndex, { align: "center", behavior })
		}
	}, [currentCollectionPath, sortedEntries, tabPath, virtualizer])
}
