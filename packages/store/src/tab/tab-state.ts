import type { Tab, TabHistoryEntry, TabSaveStateMap } from "./tab-types"

type TabStateWithActive = {
	tabs: Tab[]
	activeTabId: number | null
}

type TabStateWithSaveMap = {
	tabSaveStates: TabSaveStateMap
}

type TabStateWithHistory = TabStateWithActive & {
	history: TabHistoryEntry[]
}

export type EmptyTabState = {
	tabs: Tab[]
	activeTabId: number | null
	tabSaveStates: TabSaveStateMap
}

export const getTabSavedFromState = (
	state: TabStateWithSaveMap,
	tabId: number,
): boolean => state.tabSaveStates[tabId] ?? true

export const getActiveTabFromState = (
	state: TabStateWithActive,
): Tab | null => {
	if (state.activeTabId === null) {
		return null
	}

	return state.tabs.find((tab) => tab.id === state.activeTabId) ?? null
}

export const getActiveTabSavedFromState = (
	state: TabStateWithActive & TabStateWithSaveMap,
): boolean => {
	const activeTab = getActiveTabFromState(state)
	if (!activeTab) {
		return true
	}

	return getTabSavedFromState(state, activeTab.id)
}

export const buildEmptyTabState = (): EmptyTabState => ({
	tabs: [],
	activeTabId: null,
	tabSaveStates: {},
})

export const findTabIndexByPath = (
	state: Pick<TabStateWithActive, "tabs">,
	path: string,
): number => state.tabs.findIndex((tab) => tab.path === path)

export const removeTabSaveState = (
	tabSaveStates: TabSaveStateMap,
	tabId: number,
): TabSaveStateMap => {
	if (!Object.hasOwn(tabSaveStates, tabId)) {
		return tabSaveStates
	}

	const nextTabSaveStates = { ...tabSaveStates }
	delete nextTabSaveStates[tabId]
	return nextTabSaveStates
}

export const selectFallbackActiveTabId = (
	tabs: readonly Tab[],
	removedIndex: number,
): number | null => {
	if (tabs.length === 0) {
		return null
	}

	const fallbackIndex = Math.min(
		removedIndex > 0 ? removedIndex - 1 : 0,
		tabs.length - 1,
	)
	return tabs[fallbackIndex]?.id ?? null
}

export const dedupePathsPreservingLastOccurrence = (
	paths: readonly string[],
): string[] => {
	const seen = new Set<string>()
	const uniquePaths: string[] = []

	for (let index = paths.length - 1; index >= 0; index -= 1) {
		const path = paths[index]
		if (seen.has(path)) {
			continue
		}

		seen.add(path)
		uniquePaths.unshift(path)
	}

	return uniquePaths
}

export const buildPersistedLastOpenedFilePaths = (
	state: TabStateWithHistory,
	maxPersistedPaths: number,
): string[] => {
	if (state.tabs.length === 0) {
		return []
	}

	const openTabPaths = state.tabs.map((tab) => tab.path)
	const openTabPathSet = new Set(openTabPaths)
	const historyPaths = dedupePathsPreservingLastOccurrence(
		state.history
			.map((entry) => entry.path)
			.filter((path) => openTabPathSet.has(path)),
	)
	const activeTabPath = getActiveTabFromState(state)?.path ?? null
	const fallbackPaths = activeTabPath
		? [...openTabPaths.filter((path) => path !== activeTabPath), activeTabPath]
		: openTabPaths

	for (const path of fallbackPaths) {
		if (!historyPaths.includes(path)) {
			historyPaths.push(path)
		}
	}

	return historyPaths.slice(-maxPersistedPaths)
}
