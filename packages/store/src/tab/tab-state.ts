import type { Tab, TabNavigationState, TabSaveStateMap } from "./tab-types"

type TabStateWithActive = {
	tabs: Tab[]
	activeTabId: number | null
}

type TabStateWithSaveMap = {
	tabSaveStates: TabSaveStateMap
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

export const buildInitialTabHistory = (
	path: string,
): Pick<TabNavigationState, "history" | "historyIndex"> => ({
	history: [
		{
			path,
			selection: null,
		},
	],
	historyIndex: 0,
})

export const getActiveTabHistoryFromState = (
	state: TabStateWithActive,
): TabNavigationState => {
	const activeTab = getActiveTabFromState(state)
	if (!activeTab) {
		return {
			history: [],
			historyIndex: -1,
		}
	}

	return {
		history: activeTab.history,
		historyIndex: activeTab.historyIndex,
	}
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
	state: TabStateWithActive,
	maxPersistedPaths: number,
): string[] => {
	if (state.tabs.length === 0) {
		return []
	}

	const openTabPaths = state.tabs.map((tab) => tab.path)
	const activeTabPath = getActiveTabFromState(state)?.path ?? null
	return (
		activeTabPath
			? [
					...openTabPaths.filter((path) => path !== activeTabPath),
					activeTabPath,
				]
			: openTabPaths
	).slice(-maxPersistedPaths)
}
