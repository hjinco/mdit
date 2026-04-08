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
	const selectionProviders = new Map<
		number,
		(() => TabHistorySelection) | null
	>()
	const pendingRestoreByTabId = new Map<
		number,
		{
			path: string
			selection: TabHistorySelection
		}
	>()

	return {
		setSelectionProvider: (
			tabId: number,
			provider: (() => TabHistorySelection) | null,
		) => {
			if (provider) {
				selectionProviders.set(tabId, provider)
				return
			}

			selectionProviders.delete(tabId)
		},
		clear: (tabId: number) => {
			selectionProviders.delete(tabId)
			pendingRestoreByTabId.delete(tabId)
		},
		readCurrentSelection: (tabId: number): TabHistorySelection => {
			const selectionProvider = selectionProviders.get(tabId)
			if (!selectionProvider) {
				return null
			}

			try {
				return cloneHistorySelection(selectionProvider())
			} catch {
				return null
			}
		},
		queuePendingRestore: (
			tabId: number,
			path: string,
			selection: TabHistorySelection,
		) => {
			pendingRestoreByTabId.set(tabId, {
				path,
				selection: cloneHistorySelection(selection),
			})
		},
		clearPendingRestore: (tabId: number) => {
			pendingRestoreByTabId.delete(tabId)
		},
		consumePendingRestore: (
			tabId: number,
			path: string,
		): PendingHistorySelectionRestoreResult => {
			const pendingRestore = pendingRestoreByTabId.get(tabId)
			if (!pendingRestore || pendingRestore.path !== path) {
				return { found: false }
			}

			const selection = cloneHistorySelection(pendingRestore.selection)
			pendingRestoreByTabId.delete(tabId)
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
