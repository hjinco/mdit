type HistoryEntryLike = {
	path: string
}

export function removePathFromHistory<T extends HistoryEntryLike>(
	history: T[],
	historyIndex: number,
	pathToRemove: string,
): { history: T[]; historyIndex: number } {
	const nextHistory = history.filter((entry) => entry.path !== pathToRemove)
	const removedEntriesBeforeOrAtIndex = history
		.slice(0, historyIndex + 1)
		.filter((entry) => entry.path === pathToRemove).length

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
