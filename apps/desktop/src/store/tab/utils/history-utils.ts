import { isPathEqualOrDescendant } from "@/utils/path-utils"

type HistoryEntryLike = {
	path: string
}

export function removePathsFromHistory<T extends HistoryEntryLike>(
	history: T[],
	historyIndex: number,
	pathsToRemove: string[],
): { history: T[]; historyIndex: number } {
	if (pathsToRemove.length === 0) {
		return { history, historyIndex }
	}

	const shouldRemovePath = (entryPath: string): boolean =>
		pathsToRemove.some((pathToRemove) =>
			isPathEqualOrDescendant(entryPath, pathToRemove),
		)

	const nextHistory = history.filter((entry) => !shouldRemovePath(entry.path))
	const removedEntriesBeforeOrAtIndex = history
		.slice(0, historyIndex + 1)
		.filter((entry) => shouldRemovePath(entry.path)).length

	let nextHistoryIndex = historyIndex - removedEntriesBeforeOrAtIndex

	if (nextHistory.length === 0) {
		nextHistoryIndex = -1
	} else if (nextHistoryIndex < 0) {
		nextHistoryIndex = 0
	}

	return {
		history: nextHistory,
		historyIndex: nextHistoryIndex,
	}
}
