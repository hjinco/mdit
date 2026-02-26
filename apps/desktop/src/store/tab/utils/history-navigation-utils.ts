type HistoryEntryLike = {
	path: string
}

export type HistoryNavigationTarget<T extends HistoryEntryLike> = {
	historyIndex: number
	targetEntry: T
}

export function appendHistoryEntry<T extends HistoryEntryLike>(
	history: T[],
	historyIndex: number,
	entry: T,
	maxHistoryLength: number,
): { history: T[]; historyIndex: number; didChange: boolean } {
	const isDifferentFromCurrent =
		historyIndex === -1 || history[historyIndex]?.path !== entry.path

	if (!isDifferentFromCurrent) {
		return {
			history,
			historyIndex,
			didChange: false,
		}
	}

	let nextHistory = history.slice(0, historyIndex + 1)
	nextHistory.push(entry)

	let nextHistoryIndex = nextHistory.length - 1

	if (nextHistory.length > maxHistoryLength) {
		const excess = nextHistory.length - maxHistoryLength
		nextHistory = nextHistory.slice(excess)
		nextHistoryIndex -= excess
	}

	return {
		history: nextHistory,
		historyIndex: nextHistoryIndex,
		didChange: true,
	}
}

export function getHistoryNavigationTarget<T extends HistoryEntryLike>(
	history: T[],
	historyIndex: number,
	delta: -1 | 1,
): HistoryNavigationTarget<T> | null {
	const nextIndex = historyIndex + delta

	if (nextIndex < 0 || nextIndex >= history.length) {
		return null
	}

	const targetEntry = history[nextIndex]
	if (!targetEntry) {
		return null
	}

	return {
		historyIndex: nextIndex,
		targetEntry,
	}
}

export function replaceHistoryPath<T extends HistoryEntryLike>(
	history: T[],
	oldPath: string,
	newPath: string,
): T[] {
	return history.map((entry) =>
		entry.path === oldPath
			? {
					...entry,
					path: newPath,
				}
			: entry,
	)
}
