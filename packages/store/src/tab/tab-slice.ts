import {
	getFileNameWithoutExtension,
	isPathEqualOrDescendant,
} from "@mdit/utils/path-utils"
import { relative, resolve } from "pathe"
import type { StateCreator } from "zustand"
import type { WorkspaceSettings } from "../workspace/workspace-settings"
import type { WorkspaceSlice } from "../workspace/workspace-slice"
import { createLastOpenedFileHistoryPersistence } from "./tab-persistence"
import {
	createExternalReloadSaveSkipTracker,
	createTabHistorySession,
	updateHistorySelection,
} from "./tab-session"
import {
	buildEmptyTabState,
	buildInitialTabHistory,
	dedupePathsPreservingLastOccurrence,
	findTabIndexByPath,
	getActiveTabFromState,
	getActiveTabHistoryFromState,
	getActiveTabSavedFromState,
	getTabSavedFromState,
	removeTabSaveState,
	selectFallbackActiveTabId,
} from "./tab-state"
import type {
	OpenTabSnapshot,
	PendingHistorySelectionRestoreResult,
	Tab,
	TabHistorySelection,
	TabSaveStateMap,
} from "./tab-types"
import {
	appendHistoryEntry,
	getHistoryNavigationTarget,
	replaceHistoryPath,
} from "./utils/history-navigation-utils"
import { removePathsFromHistory as removePathsFromHistoryEntries } from "./utils/history-utils"

let tabIdCounter = 0

const MAX_HISTORY_LENGTH = 50

export type TabSliceDependencies = {
	readTextFile: (path: string) => Promise<string>
	renameFile: (oldPath: string, newPath: string) => Promise<void>
	saveSettings: (
		workspacePath: string,
		settings: Partial<WorkspaceSettings>,
	) => Promise<void>
}

export type {
	OpenTabSnapshot,
	PendingHistorySelectionRestoreResult,
	Tab,
	TabHistoryEntry,
	TabHistoryPoint,
	TabHistorySelection,
	TabSaveStateMap,
} from "./tab-types"

type RenameTabOptions = {
	refreshContent?: boolean
	renameOnFs?: boolean
	clearSyncedName?: boolean
}

type OpenTabOptions = {
	initialContent?: string
	skipSelectionCapture?: boolean
}

type RefreshTabFromExternalContentOptions = {
	preserveSelection?: boolean
}

export type TabSlice = {
	tabs: Tab[]
	activeTabId: number | null
	tabSaveStates: TabSaveStateMap
	activateTab: (path: string) => void
	activateTabById: (tabId: number) => void
	activateNextTab: () => void
	activatePreviousTab: () => void
	getTabById: (tabId: number) => Tab | null
	getTabPathById: (tabId: number) => string | null
	setHistorySelectionProvider: (
		provider: (() => TabHistorySelection) | null,
	) => void
	setTabHistorySelectionProvider: (
		tabId: number,
		provider: (() => TabHistorySelection) | null,
	) => void
	consumePendingHistorySelectionRestore: (
		path: string,
	) => PendingHistorySelectionRestoreResult
	consumeTabPendingHistorySelectionRestore: (
		tabId: number,
		path: string,
	) => PendingHistorySelectionRestoreResult
	refreshTabFromExternalContent: (
		path: string,
		content: string,
		options?: RefreshTabFromExternalContentOptions,
	) => void
	consumePendingExternalReloadSaveSkip: (tabId: number) => boolean
	hydrateFromOpenedFiles: (paths: string[]) => Promise<boolean>
	openTab: (
		path: string,
		skipHistory?: boolean,
		force?: boolean,
		options?: OpenTabOptions,
	) => Promise<void>
	openTabInNewTab: (path: string, options?: OpenTabOptions) => Promise<void>
	closeActiveTab: () => void
	closeTab: (path: string) => void
	closeTabById: (tabId: number) => void
	closeAllTabs: () => void
	renameTab: (
		oldPath: string,
		newPath: string,
		options?: RenameTabOptions,
	) => Promise<void>
	setTabSaved: (tabId: number, isSaved: boolean) => void
	setActiveTabSyncedName: (name: string) => void
	setTabSyncedName: (tabId: number, name: string) => void
	clearActiveTabSyncedName: () => void
	clearTabSyncedName: (tabId: number) => void
	goBack: () => Promise<boolean>
	goForward: () => Promise<boolean>
	canGoBack: () => boolean
	canGoForward: () => boolean
	getActiveTab: () => Tab | null
	getOpenTabSnapshots: () => OpenTabSnapshot[]
	getActiveTabPath: () => string | null
	getIsSaved: () => boolean
	updateHistoryPath: (oldPath: string, newPath: string) => void
	removePathsFromHistory: (paths: string[]) => void
	clearHistory: () => void
}

export const prepareTabSlice =
	({
		readTextFile,
		renameFile,
		saveSettings,
	}: TabSliceDependencies): StateCreator<
		TabSlice & WorkspaceSlice,
		[],
		[],
		TabSlice
	> =>
	(set, get) => {
		const historySession = createTabHistorySession()
		const externalReloadSaveSkipTracker = createExternalReloadSaveSkipTracker()
		const lastOpenedFileHistoryPersistence =
			createLastOpenedFileHistoryPersistence({
				getState: () => {
					const state = get()
					return {
						workspacePath: state.workspacePath,
						tabs: state.tabs,
						activeTabId: state.activeTabId,
					}
				},
				saveSettings,
				onError: (error) => {
					console.error("Failed to persist last opened file history:", error)
				},
			})

		const findTabIndexById = (tabs: Tab[], tabId: number): number =>
			tabs.findIndex((tab) => tab.id === tabId)

		const buildTab = ({
			path,
			name,
			content,
		}: Pick<Tab, "path" | "name" | "content">): Tab => ({
			id: ++tabIdCounter,
			sessionEpoch: 0,
			path,
			name,
			content,
			...buildInitialTabHistory(path),
		})

		const updateTabById = (
			state: Pick<TabSlice, "tabs">,
			tabId: number,
			updater: (tab: Tab) => Tab | null,
		): Pick<TabSlice, "tabs"> | {} => {
			const tabIndex = findTabIndexById(state.tabs, tabId)
			if (tabIndex === -1) {
				return {}
			}

			const currentTab = state.tabs[tabIndex]
			const nextTab = updater(currentTab)
			if (!nextTab) {
				return {}
			}

			const nextTabs = [...state.tabs]
			nextTabs[tabIndex] = nextTab
			return {
				tabs: nextTabs,
			}
		}

		const bumpTabSessionEpoch = (
			state: Pick<TabSlice, "tabs">,
			tabId: number,
		): Pick<TabSlice, "tabs"> | {} =>
			updateTabById(state, tabId, (tab) => ({
				...tab,
				sessionEpoch: tab.sessionEpoch + 1,
			}))

		const updateCurrentHistorySelection = (selection: TabHistorySelection) => {
			set((state) => {
				const activeTab = getActiveTabFromState(state)
				if (!activeTab) {
					return {}
				}

				const nextHistory = updateHistorySelection(activeTab, selection)
				if (!nextHistory) {
					return {}
				}

				return updateTabById(state, activeTab.id, (tab) => ({
					...tab,
					history: nextHistory,
				}))
			})
		}

		const commitCurrentHistorySelection = () => {
			const activeTabId = get().activeTabId
			if (activeTabId === null) {
				return
			}

			updateCurrentHistorySelection(
				historySession.readCurrentSelection(activeTabId),
			)
		}

		const appendVisitToTabHistory = (tabId: number, path: string) => {
			set((state) =>
				updateTabById(state, tabId, (tab) => {
					const nextHistoryState = appendHistoryEntry(
						tab.history,
						tab.historyIndex,
						{
							path,
							selection: null,
						},
						MAX_HISTORY_LENGTH,
						{
							allowDuplicatePath: true,
						},
					)

					if (!nextHistoryState.didChange) {
						return null
					}

					return {
						...tab,
						history: nextHistoryState.history,
						historyIndex: nextHistoryState.historyIndex,
					}
				}),
			)
		}

		const activateTabByIndex = (tabIndex: number): Tab | null => {
			let activatedTab: Tab | null = null

			set((state) => {
				const targetTab = state.tabs[tabIndex]
				if (!targetTab || state.activeTabId === targetTab.id) {
					return {}
				}

				activatedTab = targetTab
				return {
					activeTabId: targetTab.id,
				}
			})

			return activatedTab
		}

		const activateTabAndTrack = (tabIndex: number) => {
			const activatedTab = activateTabByIndex(tabIndex)
			if (!activatedTab) {
				return
			}

			appendVisitToTabHistory(activatedTab.id, activatedTab.path)
			lastOpenedFileHistoryPersistence.enqueueSafely()
		}

		const loadTabDraft = async (
			path: string,
			options?: OpenTabOptions,
		): Promise<Pick<Tab, "path" | "name" | "content"> | null> => {
			const content =
				options?.initialContent !== undefined
					? options.initialContent
					: await readTextFile(path)
			const name = getFileNameWithoutExtension(path)

			if (!name) {
				return null
			}

			return {
				path,
				name,
				content,
			}
		}

		const appendTabAndActivate = async (
			tabDraft: Pick<Tab, "path" | "name" | "content">,
		) => {
			const nextTab = buildTab(tabDraft)
			set((currentState) => {
				return {
					tabs: [...currentState.tabs, nextTab],
					activeTabId: nextTab.id,
					tabSaveStates: {
						...currentState.tabSaveStates,
						[nextTab.id]: true,
					},
				}
			})
			await persistLastOpenedTabs()
		}

		const closeTabByIdInternal = (tabId: number): boolean =>
			setAndPersistLastOpenedFileHistory((state) => {
				const tabIndex = findTabIndexById(state.tabs, tabId)
				if (tabIndex === -1) {
					return {}
				}

				const tab = state.tabs[tabIndex]
				externalReloadSaveSkipTracker.remove(tab.id)
				historySession.clear(tab.id)
				const nextTabs = state.tabs.filter((_, index) => index !== tabIndex)
				const nextActiveTabId =
					state.activeTabId === tab.id
						? selectFallbackActiveTabId(nextTabs, tabIndex)
						: state.activeTabId
				const nextTabSaveStates = removeTabSaveState(
					state.tabSaveStates,
					tab.id,
				)

				return {
					tabs: nextTabs,
					activeTabId: nextActiveTabId,
					tabSaveStates: nextTabSaveStates,
				}
			})

		const setAndPersistLastOpenedFileHistory = (
			updater: (state: TabSlice) => Partial<TabSlice> | {},
		): boolean => {
			let didChange = false

			set((state) => {
				const nextState = updater(state)
				didChange = Object.keys(nextState).length > 0
				return nextState
			})

			if (didChange) {
				lastOpenedFileHistoryPersistence.enqueueSafely()
			}

			return didChange
		}

		const persistLastOpenedTabs = async () => {
			await lastOpenedFileHistoryPersistence.enqueue()
		}

		const resetActiveTabSession = () => {
			set((state) => {
				const activeTab = getActiveTabFromState(state)
				if (!activeTab) {
					return {}
				}

				return bumpTabSessionEpoch(state, activeTab.id)
			})
		}

		const navigateHistory = async (
			delta: -1 | 1,
			direction: "back" | "forward",
		): Promise<boolean> => {
			const state = get()
			const activeTab = getActiveTabFromState(state)
			if (!activeTab) {
				return false
			}

			const navigationTarget = getHistoryNavigationTarget(
				activeTab.history,
				activeTab.historyIndex,
				delta,
			)

			if (!navigationTarget) {
				return false
			}

			commitCurrentHistorySelection()
			historySession.queuePendingRestore(
				activeTab.id,
				navigationTarget.targetEntry.path,
				navigationTarget.targetEntry.selection,
			)

			set((currentState) =>
				updateTabById(currentState, activeTab.id, (tab) => ({
					...tab,
					historyIndex: navigationTarget.historyIndex,
				})),
			)

			try {
				if (navigationTarget.targetEntry.path === activeTab.path) {
					resetActiveTabSession()
					return true
				}

				await get().openTab(navigationTarget.targetEntry.path, true, false, {
					skipSelectionCapture: true,
				})
				return true
			} catch (error) {
				historySession.clearPendingRestore(activeTab.id)
				console.error(`Failed to go ${direction} in history:`, error)
				return false
			}
		}

		return {
			...buildEmptyTabState(),
			activateTab: (path) => {
				commitCurrentHistorySelection()

				const tabIndex = findTabIndexByPath(get(), path)
				if (tabIndex === -1) {
					return
				}

				activateTabAndTrack(tabIndex)
			},
			activateTabById: (tabId) => {
				commitCurrentHistorySelection()

				const tabIndex = findTabIndexById(get().tabs, tabId)
				if (tabIndex === -1) {
					return
				}

				activateTabAndTrack(tabIndex)
			},
			activateNextTab: () => {
				commitCurrentHistorySelection()

				const state = get()
				if (state.tabs.length <= 1) {
					return
				}

				const activeTabIndex = state.tabs.findIndex(
					(tab) => tab.id === state.activeTabId,
				)
				if (activeTabIndex === -1) {
					return
				}

				activateTabAndTrack((activeTabIndex + 1) % state.tabs.length)
			},
			activatePreviousTab: () => {
				commitCurrentHistorySelection()

				const state = get()
				if (state.tabs.length <= 1) {
					return
				}

				const activeTabIndex = state.tabs.findIndex(
					(tab) => tab.id === state.activeTabId,
				)
				if (activeTabIndex === -1) {
					return
				}

				activateTabAndTrack(
					(activeTabIndex - 1 + state.tabs.length) % state.tabs.length,
				)
			},
			setHistorySelectionProvider: (provider) => {
				const activeTabId = get().activeTabId
				if (activeTabId === null) {
					return
				}

				historySession.setSelectionProvider(activeTabId, provider)
			},
			setTabHistorySelectionProvider: (tabId, provider) => {
				historySession.setSelectionProvider(tabId, provider)
			},
			consumePendingHistorySelectionRestore: (path) =>
				(() => {
					const activeTabId = get().activeTabId
					if (activeTabId === null) {
						return { found: false } as const
					}

					return historySession.consumePendingRestore(activeTabId, path)
				})(),
			consumeTabPendingHistorySelectionRestore: (tabId, path) =>
				historySession.consumePendingRestore(tabId, path),
			refreshTabFromExternalContent: (path, content, options) => {
				const state = get()
				const tabIndex = findTabIndexByPath(state, path)
				if (tabIndex === -1) {
					return
				}

				const matchingTab = state.tabs[tabIndex]
				if (
					matchingTab.content === content ||
					!getTabSavedFromState(state, matchingTab.id)
				) {
					return
				}

				const isActiveTab = state.activeTabId === matchingTab.id
				const nextSelection =
					isActiveTab && options?.preserveSelection
						? historySession.readCurrentSelection(matchingTab.id)
						: null
				let didRefresh = false

				set((currentState) => {
					const currentIndex = findTabIndexByPath(currentState, path)
					if (currentIndex === -1) {
						return {}
					}

					const currentTab = currentState.tabs[currentIndex]
					if (
						currentTab.content === content ||
						!getTabSavedFromState(currentState, currentTab.id)
					) {
						return {}
					}

					didRefresh = true
					const nextTabs = [...currentState.tabs]
					let nextTabSaveStates = currentState.tabSaveStates

					if (currentState.activeTabId === currentTab.id) {
						externalReloadSaveSkipTracker.add(currentTab.id)
					}

					nextTabs[currentIndex] = {
						...currentTab,
						content,
						sessionEpoch:
							currentState.activeTabId === currentTab.id
								? currentTab.sessionEpoch + 1
								: currentTab.sessionEpoch,
					}
					nextTabSaveStates = {
						...currentState.tabSaveStates,
						[currentTab.id]: true,
					}

					return {
						tabs: nextTabs,
						activeTabId: currentState.activeTabId,
						tabSaveStates: nextTabSaveStates,
					}
				})

				if (!didRefresh || !isActiveTab || !options?.preserveSelection) {
					return
				}

				updateCurrentHistorySelection(nextSelection)
				historySession.queuePendingRestore(matchingTab.id, path, nextSelection)
			},
			consumePendingExternalReloadSaveSkip: (tabId) =>
				externalReloadSaveSkipTracker.consume(tabId),
			hydrateFromOpenedFiles: async (paths: string[]) => {
				const validPaths = paths
					.filter((path) => path.endsWith(".md"))
					.slice(0, MAX_HISTORY_LENGTH)

				if (validPaths.length === 0) {
					return false
				}

				const uniquePaths = dedupePathsPreservingLastOccurrence(validPaths)
				const activePath = validPaths[validPaths.length - 1]
				if (!activePath) {
					return false
				}

				try {
					const tabs = (
						await Promise.all(
							uniquePaths.map(async (currentPath) => {
								const name = getFileNameWithoutExtension(currentPath)
								if (!name) {
									return null
								}

								const content = await readTextFile(currentPath)
								return buildTab({
									path: currentPath,
									name,
									content,
								})
							}),
						)
					).filter((tab): tab is Tab => tab !== null)

					const activeTab = tabs.find((tab) => tab.path === activePath)
					if (!activeTab) {
						return false
					}

					externalReloadSaveSkipTracker.clear()
					const tabSaveStates = Object.fromEntries(
						tabs.map((tab) => [tab.id, true]),
					) as TabSaveStateMap

					set({
						tabs,
						activeTabId: activeTab.id,
						tabSaveStates,
					})

					return true
				} catch (error) {
					console.error("Failed to hydrate tabs from opened files:", error)
					return false
				}
			},
			openTab: async (
				path: string,
				skipHistory = false,
				force = false,
				options?: OpenTabOptions,
			) => {
				if (!path.endsWith(".md")) {
					return
				}

				if (!options?.skipSelectionCapture) {
					commitCurrentHistorySelection()
				}

				const state = get()
				const activeTab = getActiveTabFromState(state)

				// If opening the same tab, don't do anything (unless force is true)
				if (!force && activeTab?.path === path) {
					return
				}

				if (!activeTab) {
					const tabDraft = await loadTabDraft(path, options)
					if (!tabDraft) {
						return
					}
					await appendTabAndActivate(tabDraft)
					return
				}

				const tabDraft = await loadTabDraft(path, options)
				if (!tabDraft) {
					return
				}

				set((currentState) => {
					const currentIndex = findTabIndexById(currentState.tabs, activeTab.id)
					if (currentIndex === -1) {
						return {}
					}

					const currentTab = currentState.tabs[currentIndex]
					const duplicateTab = currentState.tabs.find(
						(tab) => tab.id !== activeTab.id && tab.path === path,
					)
					const nextHistoryState = skipHistory
						? {
								history: currentTab.history,
								historyIndex: currentTab.historyIndex,
							}
						: appendHistoryEntry(
								currentTab.history,
								currentTab.historyIndex,
								{
									path,
									selection: null,
								},
								MAX_HISTORY_LENGTH,
							)

					const nextTabs = [...currentState.tabs]
					const nextTab = {
						...currentTab,
						path: tabDraft.path,
						name: tabDraft.name,
						content: tabDraft.content,
						syncedName: null,
						history: nextHistoryState.history,
						historyIndex: nextHistoryState.historyIndex,
						sessionEpoch: currentTab.sessionEpoch + 1,
					}
					nextTabs[currentIndex] = nextTab

					if (duplicateTab) {
						externalReloadSaveSkipTracker.remove(duplicateTab.id)
						historySession.clear(duplicateTab.id)
					}

					const dedupedTabs = duplicateTab
						? nextTabs.filter((tab) => tab.id !== duplicateTab.id)
						: nextTabs
					const nextTabSaveStates = {
						...currentState.tabSaveStates,
						[activeTab.id]: true,
					}
					if (duplicateTab) {
						delete nextTabSaveStates[duplicateTab.id]
					}

					return {
						tabs: dedupedTabs,
						activeTabId: activeTab.id,
						tabSaveStates: nextTabSaveStates,
					}
				})

				await persistLastOpenedTabs()
			},
			openTabInNewTab: async (path, options) => {
				if (!path.endsWith(".md")) {
					return
				}

				if (!options?.skipSelectionCapture) {
					commitCurrentHistorySelection()
				}

				const state = get()
				const activeTab = getActiveTabFromState(state)
				if (!activeTab) {
					const tabDraft = await loadTabDraft(path, options)
					if (!tabDraft) {
						return
					}
					await appendTabAndActivate(tabDraft)
					return
				}

				const existingTabIndex = findTabIndexByPath(state, path)
				if (existingTabIndex !== -1) {
					const existingTab = state.tabs[existingTabIndex]
					if (!existingTab || state.activeTabId === existingTab.id) {
						return
					}

					activateTabAndTrack(existingTabIndex)
					return
				}

				const tabDraft = await loadTabDraft(path, options)
				if (!tabDraft) {
					return
				}

				const nextState = get()
				const duplicateTabIndex = findTabIndexByPath(nextState, path)
				if (duplicateTabIndex !== -1) {
					const duplicateTab = nextState.tabs[duplicateTabIndex]
					if (!duplicateTab || nextState.activeTabId === duplicateTab.id) {
						return
					}

					activateTabAndTrack(duplicateTabIndex)
					return
				}

				await appendTabAndActivate(tabDraft)
			},
			closeActiveTab: () => {
				const activeTab = getActiveTabFromState(get())
				if (!activeTab) {
					return
				}

				get().closeTab(activeTab.path)
			},
			closeTab: (path) => {
				const tab = get().tabs.find((currentTab) => currentTab.path === path)
				if (!tab) {
					return
				}

				closeTabByIdInternal(tab.id)
			},
			closeTabById: (tabId) => {
				closeTabByIdInternal(tabId)
			},
			closeAllTabs: () => {
				externalReloadSaveSkipTracker.clear()
				for (const tab of get().tabs) {
					historySession.clear(tab.id)
				}
				set(buildEmptyTabState())
			},
			renameTab: async (oldPath, newPath, options) => {
				const refreshContent = options?.refreshContent ?? false
				const shouldRenameOnFs = options?.renameOnFs ?? false
				const shouldClearSyncedName = options?.clearSyncedName ?? false
				const matchingTabs = get().tabs.filter((tab) =>
					isPathEqualOrDescendant(tab.path, oldPath),
				)

				if (matchingTabs.length === 0) {
					return
				}

				if (shouldRenameOnFs && oldPath !== newPath) {
					try {
						await renameFile(oldPath, newPath)
					} catch (error) {
						console.error("Failed to rename tab on filesystem:", error)
						throw error
					}
				}

				let refreshedContent: string | null = null

				if (refreshContent) {
					if (newPath.endsWith(".md")) {
						try {
							refreshedContent = await readTextFile(newPath)
						} catch (error) {
							console.error(
								"Failed to refresh tab content after rename:",
								error,
							)
						}
					}
				}

				set((state) => ({
					...(() => {
						let didChange = false
						const nextTabs = [...state.tabs]
						let nextTabSaveStates = state.tabSaveStates

						for (let index = 0; index < state.tabs.length; index += 1) {
							const currentTab = state.tabs[index]
							if (!isPathEqualOrDescendant(currentTab.path, oldPath)) {
								continue
							}

							const nextPath =
								currentTab.path === oldPath
									? newPath
									: resolve(newPath, relative(oldPath, currentTab.path))
							const nextName = getFileNameWithoutExtension(nextPath)
							if (!nextName) {
								continue
							}

							let nextContent = currentTab.content
							const currentIsSaved = getTabSavedFromState(state, currentTab.id)

							if (refreshContent && currentTab.path === oldPath) {
								if (refreshedContent !== null) {
									nextContent = refreshedContent
								}
								nextTabSaveStates = {
									...nextTabSaveStates,
									[currentTab.id]: currentIsSaved,
								}
							}

							nextTabs[index] = {
								...currentTab,
								path: nextPath,
								name: nextName,
								content: nextContent,
								sessionEpoch:
									refreshContent && currentTab.path === oldPath
										? currentTab.sessionEpoch + 1
										: currentTab.sessionEpoch,
								history: replaceHistoryPath(
									currentTab.history,
									oldPath,
									newPath,
								),
								syncedName:
									shouldClearSyncedName && currentTab.path === oldPath
										? null
										: currentTab.syncedName,
							}
							didChange = true
						}

						if (!didChange) {
							return {}
						}

						return {
							tabs: nextTabs,
							activeTabId: state.activeTabId,
							tabSaveStates: nextTabSaveStates,
						}
					})(),
				}))
			},
			setTabSaved: (tabId, isSaved) => {
				set((state) => {
					const hasTab = state.tabs.some((tab) => tab.id === tabId)
					if (!hasTab) {
						return {}
					}

					return {
						tabSaveStates: {
							...state.tabSaveStates,
							[tabId]: isSaved,
						},
					}
				})
			},
			setTabSyncedName: (tabId, name) => {
				set((state) =>
					updateTabById(state, tabId, (tab) =>
						(tab.syncedName ?? null) === name
							? null
							: {
									...tab,
									syncedName: name,
								},
					),
				)
			},
			setActiveTabSyncedName: (name) => {
				const activeTabId = get().activeTabId
				if (activeTabId === null) {
					return
				}

				get().setTabSyncedName(activeTabId, name)
			},
			clearTabSyncedName: (tabId) => {
				set((state) =>
					updateTabById(state, tabId, (tab) =>
						tab.syncedName == null
							? null
							: {
									...tab,
									syncedName: null,
								},
					),
				)
			},
			clearActiveTabSyncedName: () => {
				const activeTabId = get().activeTabId
				if (activeTabId === null) {
					return
				}

				get().clearTabSyncedName(activeTabId)
			},
			goBack: async () => navigateHistory(-1, "back"),
			goForward: async () => navigateHistory(1, "forward"),
			canGoBack: () => getActiveTabHistoryFromState(get()).historyIndex > 0,
			canGoForward: () => {
				const { history, historyIndex } = getActiveTabHistoryFromState(get())
				return historyIndex < history.length - 1
			},
			getTabById: (tabId) => get().tabs.find((tab) => tab.id === tabId) ?? null,
			getActiveTab: () => getActiveTabFromState(get()),
			getOpenTabSnapshots: () => {
				const { tabs, tabSaveStates } = get()
				return tabs.map((tab) => ({
					path: tab.path,
					isSaved: getTabSavedFromState({ tabSaveStates }, tab.id),
				}))
			},
			getTabPathById: (tabId) => get().getTabById(tabId)?.path ?? null,
			getActiveTabPath: () => getActiveTabFromState(get())?.path ?? null,
			getIsSaved: () => getActiveTabSavedFromState(get()),
			updateHistoryPath: (oldPath: string, newPath: string) => {
				setAndPersistLastOpenedFileHistory((state) => ({
					tabs: state.tabs.map((tab) => ({
						...tab,
						history: replaceHistoryPath(tab.history, oldPath, newPath),
					})),
				}))
			},
			removePathsFromHistory: (paths) => {
				const state = get()
				const removedTabs = state.tabs.filter((tab) =>
					paths.some((path) => isPathEqualOrDescendant(tab.path, path)),
				)
				const removedTabIds = new Set(removedTabs.map((tab) => tab.id))

				for (const removedTab of removedTabs) {
					externalReloadSaveSkipTracker.remove(removedTab.id)
					historySession.clear(removedTab.id)
				}

				setAndPersistLastOpenedFileHistory((currentState) => {
					const nextTabs = currentState.tabs
						.filter((tab) => !removedTabIds.has(tab.id))
						.map((tab) => {
							const nextHistoryState = removePathsFromHistoryEntries(
								tab.history,
								tab.historyIndex,
								paths,
							)
							if (nextHistoryState.history.length === 0) {
								return {
									...tab,
									...buildInitialTabHistory(tab.path),
								}
							}

							return {
								...tab,
								history: nextHistoryState.history,
								historyIndex: nextHistoryState.historyIndex,
							}
						})
					let nextActiveTabId = currentState.activeTabId
					if (
						currentState.activeTabId !== null &&
						removedTabIds.has(currentState.activeTabId)
					) {
						const removedIndex = currentState.tabs.findIndex(
							(tab) => tab.id === currentState.activeTabId,
						)
						nextActiveTabId = selectFallbackActiveTabId(nextTabs, removedIndex)
					}

					const nextTabSaveStates = Object.fromEntries(
						Object.entries(currentState.tabSaveStates).filter(
							([tabId]) => !removedTabIds.has(Number(tabId)),
						),
					) as TabSaveStateMap

					return {
						tabs: nextTabs,
						activeTabId: nextActiveTabId,
						tabSaveStates: nextTabSaveStates,
					}
				})
			},
			clearHistory: () => {
				for (const tab of get().tabs) {
					historySession.clearPendingRestore(tab.id)
				}
				set((state) => ({
					tabs: state.tabs.map((tab) => ({
						...tab,
						...buildInitialTabHistory(tab.path),
					})),
				}))
			},
		}
	}
