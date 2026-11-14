import {
	isPathEqualOrDescendant,
	normalizePathSeparators,
} from "@mdit/utils/path-utils"
import type {
	PendingHistorySelectionRestoreResult,
	Tab,
	TabHistoryPoint,
	TabHistorySelection,
} from "./types"

export const initialHistory = (path: string) => ({
	history: [{ path, selection: null }],
	historyIndex: 0,
})

type HistoryEntryLike = {
	path: string
}

type HistoryNavigationTarget<T extends HistoryEntryLike> = {
	historyIndex: number
	targetEntry: T
}

export function appendHistoryEntry<T extends HistoryEntryLike>(
	history: T[],
	historyIndex: number,
	entry: T,
	maxHistoryLength: number,
	options?: {
		allowDuplicatePath?: boolean
	},
): { history: T[]; historyIndex: number; didChange: boolean } {
	const isDifferentFromCurrent =
		options?.allowDuplicatePath === true
			? true
			: historyIndex === -1 || history[historyIndex]?.path !== entry.path

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
	const normalizedOldPath = normalizePathSeparators(oldPath)
	const normalizedNewPath = normalizePathSeparators(newPath)

	return history.map((entry) => {
		const normalizedEntryPath = normalizePathSeparators(entry.path)

		if (normalizedEntryPath === normalizedOldPath) {
			return {
				...entry,
				path: normalizedNewPath,
			}
		}

		if (normalizedEntryPath.startsWith(`${normalizedOldPath}/`)) {
			return {
				...entry,
				path: `${normalizedNewPath}${normalizedEntryPath.slice(
					normalizedOldPath.length,
				)}`,
			}
		}

		return entry
	})
}

export function removePathsFromHistory<T extends HistoryEntryLike>(
	history: T[],
	historyIndex: number,
	pathsToRemove: string[],
	options?: { exact?: boolean },
): { history: T[]; historyIndex: number } {
	if (pathsToRemove.length === 0) {
		return { history, historyIndex }
	}

	const shouldRemovePath = (entryPath: string): boolean =>
		pathsToRemove.some((pathToRemove) =>
			options?.exact
				? entryPath === pathToRemove
				: isPathEqualOrDescendant(entryPath, pathToRemove),
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

export const rememberSelection = (tab: Tab, selection: TabHistorySelection) => {
	const entry = tab.history[tab.historyIndex]
	if (!entry || areHistorySelectionsEqual(entry.selection, selection)) {
		return tab
	}

	const history = [...tab.history]
	history[tab.historyIndex] = { ...entry, selection }
	return { ...tab, history }
}

export function createTabSelections() {
	const providers = new Map<number, () => TabHistorySelection>()
	const pending = new Map<
		number,
		{ path: string; selection: TabHistorySelection }
	>()

	return {
		register: (id: number, provider: (() => TabHistorySelection) | null) => {
			if (provider) {
				providers.set(id, provider)
			} else {
				providers.delete(id)
			}
		},
		read: (id: number): TabHistorySelection => {
			try {
				return cloneHistorySelection(providers.get(id)?.() ?? null)
			} catch {
				return null
			}
		},
		queue: (id: number, path: string, selection: TabHistorySelection) => {
			pending.set(id, { path, selection: cloneHistorySelection(selection) })
		},
		consume: (
			id: number,
			path: string,
		): PendingHistorySelectionRestoreResult => {
			const restore = pending.get(id)
			if (restore?.path !== path) {
				return { found: false }
			}
			pending.delete(id)
			return { found: true, selection: restore.selection }
		},
		clear: (id: number) => {
			pending.delete(id)
			providers.delete(id)
		},
	}
}

function cloneSelectionPoint(point: TabHistoryPoint): TabHistoryPoint {
	return {
		...point,
		path: [...point.path],
	}
}

function areSelectionPointsEqual(
	a: TabHistoryPoint,
	b: TabHistoryPoint,
): boolean {
	if (a.offset !== b.offset || a.path.length !== b.path.length) {
		return false
	}

	for (let i = 0; i < a.path.length; i++) {
		if (a.path[i] !== b.path[i]) {
			return false
		}
	}

	return true
}

function cloneHistorySelection(
	selection: TabHistorySelection,
): TabHistorySelection {
	if (!selection) {
		return selection
	}

	return {
		anchor: cloneSelectionPoint(selection.anchor),
		focus: cloneSelectionPoint(selection.focus),
	}
}

function areHistorySelectionsEqual(
	a: TabHistorySelection,
	b: TabHistorySelection,
): boolean {
	if (!a && !b) {
		return true
	}

	if (!a || !b) {
		return false
	}

	return (
		areSelectionPointsEqual(a.anchor, b.anchor) &&
		areSelectionPointsEqual(a.focus, b.focus)
	)
}
