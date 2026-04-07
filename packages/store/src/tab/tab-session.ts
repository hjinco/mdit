import type {
	PendingHistorySelectionRestoreResult,
	TabHistoryEntry,
	TabHistorySelection,
} from "./tab-types"
import {
	areHistorySelectionsEqual,
	cloneHistorySelection,
} from "./utils/history-selection-utils"

type TabHistoryState = {
	history: TabHistoryEntry[]
	historyIndex: number
}

export const updateHistorySelection = (
	state: TabHistoryState,
	selection: TabHistorySelection,
): TabHistoryEntry[] | null => {
	if (
		state.historyIndex < 0 ||
		state.historyIndex >= state.history.length ||
		areHistorySelectionsEqual(
			state.history[state.historyIndex].selection,
			selection,
		)
	) {
		return null
	}

	const nextHistory = [...state.history]
	nextHistory[state.historyIndex] = {
		...nextHistory[state.historyIndex],
		selection,
	}
	return nextHistory
}

export const createTabHistorySession = () => {
	let selectionProvider: (() => TabHistorySelection) | null = null
	let pendingRestore: {
		path: string
		selection: TabHistorySelection
	} | null = null

	return {
		setSelectionProvider: (provider: (() => TabHistorySelection) | null) => {
			selectionProvider = provider
		},
		readCurrentSelection: (): TabHistorySelection => {
			if (!selectionProvider) {
				return null
			}

			try {
				return cloneHistorySelection(selectionProvider())
			} catch {
				return null
			}
		},
		queuePendingRestore: (path: string, selection: TabHistorySelection) => {
			pendingRestore = {
				path,
				selection: cloneHistorySelection(selection),
			}
		},
		clearPendingRestore: () => {
			pendingRestore = null
		},
		consumePendingRestore: (
			path: string,
		): PendingHistorySelectionRestoreResult => {
			if (!pendingRestore || pendingRestore.path !== path) {
				return { found: false }
			}

			const selection = cloneHistorySelection(pendingRestore.selection)
			pendingRestore = null
			return { found: true, selection }
		},
	}
}

export const createExternalReloadSaveSkipTracker = () => {
	const pendingTabIds = new Set<number>()

	return {
		add: (tabId: number) => {
			pendingTabIds.add(tabId)
		},
		remove: (tabId: number) => {
			pendingTabIds.delete(tabId)
		},
		clear: () => {
			pendingTabIds.clear()
		},
		consume: (tabId: number): boolean => {
			const shouldSkip = pendingTabIds.has(tabId)
			if (shouldSkip) {
				pendingTabIds.delete(tabId)
			}
			return shouldSkip
		},
	}
}
