import type { DocumentsSnapshot, ResolvedTab, Tab } from "./types"

export const selectDocumentById = (state: DocumentsSnapshot, id: number) =>
	state.openDocuments.find((document) => document.id === id) ?? null

export const selectActiveDocumentId = (state: DocumentsSnapshot) =>
	state.tabs.find((tab) => tab.id === state.activeTabId)?.documentId ?? null

export const selectActiveDocument = (state: DocumentsSnapshot) => {
	const id = selectActiveDocumentId(state)
	return id === null ? null : selectDocumentById(state, id)
}

const resolveTab = (state: DocumentsSnapshot, tab: Tab): ResolvedTab | null => {
	const document = selectDocumentById(state, tab.documentId)
	if (!document) {
		return null
	}

	const { path, name, content, isSaved, sessionEpoch } = document
	return { ...tab, path, name, content, isSaved, sessionEpoch }
}

export const selectTabById = (state: DocumentsSnapshot, id: number) => {
	const tab = state.tabs.find((tab) => tab.id === id)
	return tab ? resolveTab(state, tab) : null
}

export const selectResolvedTabs = (state: DocumentsSnapshot) =>
	state.tabs.flatMap((tab) => resolveTab(state, tab) ?? [])

export const selectActiveTab = (state: DocumentsSnapshot) =>
	state.activeTabId === null ? null : selectTabById(state, state.activeTabId)

export const selectActiveTabPath = (state: DocumentsSnapshot) =>
	selectActiveDocument(state)?.path ?? null

export const selectTabPathById = (state: DocumentsSnapshot, id: number) =>
	selectTabById(state, id)?.path ?? null

export const selectIsSaved = (state: DocumentsSnapshot) =>
	selectActiveDocument(state)?.isSaved ?? true

export const selectCanGoBack = (state: DocumentsSnapshot) =>
	(selectActiveTab(state)?.historyIndex ?? -1) > 0

export const selectCanGoForward = (state: DocumentsSnapshot) => {
	const tab = selectActiveTab(state)
	return tab !== null && tab.historyIndex < tab.history.length - 1
}
