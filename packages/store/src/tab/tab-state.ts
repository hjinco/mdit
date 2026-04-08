import type {
	OpenDocument,
	OpenDocumentSnapshot,
	ResolvedTab,
	Tab,
	TabNavigationState,
} from "./tab-types"

type TabStateWithDocuments = {
	tabs: Tab[]
	openDocuments: OpenDocument[]
}

type TabStateWithActive = TabStateWithDocuments & {
	activeTabId: number | null
}

export type EmptyTabState = {
	tabs: Tab[]
	openDocuments: OpenDocument[]
	activeTabId: number | null
}

export const getDocumentByIdFromState = (
	state: Pick<TabStateWithDocuments, "openDocuments">,
	documentId: number,
): OpenDocument | null =>
	state.openDocuments.find((document) => document.id === documentId) ?? null

export const getDocumentByPathFromState = (
	state: Pick<TabStateWithDocuments, "openDocuments">,
	path: string,
): OpenDocument | null =>
	state.openDocuments.find((document) => document.path === path) ?? null

export const resolveTabFromState = (
	state: TabStateWithDocuments,
	tab: Tab,
): ResolvedTab | null => {
	const document = getDocumentByIdFromState(state, tab.documentId)
	if (!document) {
		return null
	}

	return {
		...tab,
		path: document.path,
		name: document.name,
		content: document.content,
		sessionEpoch: document.sessionEpoch,
		isSaved: document.isSaved,
	}
}

export const getResolvedTabsFromState = (
	state: TabStateWithDocuments,
): ResolvedTab[] =>
	state.tabs
		.map((tab) => resolveTabFromState(state, tab))
		.filter((tab): tab is ResolvedTab => tab !== null)

export const getTabByIdFromState = (
	state: TabStateWithDocuments,
	tabId: number,
): Tab | null => state.tabs.find((tab) => tab.id === tabId) ?? null

export const getResolvedTabByIdFromState = (
	state: TabStateWithDocuments,
	tabId: number,
): ResolvedTab | null => {
	const tab = getTabByIdFromState(state, tabId)
	return tab ? resolveTabFromState(state, tab) : null
}

export const getActiveTabFromState = (
	state: TabStateWithActive,
): ResolvedTab | null => {
	if (state.activeTabId === null) {
		return null
	}

	return getResolvedTabByIdFromState(state, state.activeTabId)
}

export const getActiveDocumentFromState = (
	state: TabStateWithActive,
): OpenDocument | null => {
	const activeTab = getTabByIdFromState(state, state.activeTabId ?? -1)
	if (!activeTab) {
		return null
	}

	return getDocumentByIdFromState(state, activeTab.documentId)
}

export const getActiveDocumentIdFromState = (
	state: TabStateWithActive,
): number | null => {
	const activeTab = getTabByIdFromState(state, state.activeTabId ?? -1)
	return activeTab?.documentId ?? null
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
	const activeTab = getTabByIdFromState(state, state.activeTabId ?? -1)
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
	state: TabStateWithActive,
): boolean => getActiveDocumentFromState(state)?.isSaved ?? true

export const buildEmptyTabState = (): EmptyTabState => ({
	tabs: [],
	openDocuments: [],
	activeTabId: null,
})

export const findTabIndexByPath = (
	state: TabStateWithDocuments,
	path: string,
): number =>
	state.tabs.findIndex((tab) => {
		const document = getDocumentByIdFromState(state, tab.documentId)
		return document?.path === path
	})

export const findDocumentIndexByPath = (
	state: Pick<TabStateWithDocuments, "openDocuments">,
	path: string,
): number => state.openDocuments.findIndex((document) => document.path === path)

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

export const buildPersistedLastOpenedFilePaths = (
	state: TabStateWithActive,
	maxPersistedPaths: number,
): string[] => {
	if (state.tabs.length === 0) {
		return []
	}

	const activeTabIndex = state.tabs.findIndex(
		(tab) => tab.id === state.activeTabId,
	)
	const orderedTabs =
		activeTabIndex === -1
			? state.tabs
			: [
					...state.tabs.slice(0, activeTabIndex),
					...state.tabs.slice(activeTabIndex + 1),
					state.tabs[activeTabIndex],
				]

	return orderedTabs
		.map((tab) => getDocumentByIdFromState(state, tab.documentId)?.path ?? null)
		.filter((path): path is string => path !== null)
		.slice(-maxPersistedPaths)
}

export const getOpenDocumentSnapshotsFromState = (
	state: Pick<TabStateWithDocuments, "openDocuments">,
): OpenDocumentSnapshot[] =>
	state.openDocuments.map((document) => ({
		documentId: document.id,
		path: document.path,
		isSaved: document.isSaved,
	}))
