import {
	getFileNameWithoutExtension,
	isPathEqualOrDescendant,
} from "@mdit/utils/path-utils"
import { relative, resolve } from "pathe"
import type { StateCreator } from "zustand"
import type { WorkspaceSettings } from "../workspace/workspace-settings"
import type { WorkspaceSlice } from "../workspace/workspace-slice"
import {
	appendHistoryEntry,
	getHistoryNavigationTarget,
	replaceHistoryPath,
} from "./utils/history-navigation-utils"
import {
	areHistorySelectionsEqual,
	cloneHistorySelection,
} from "./utils/history-selection-utils"
import { removePathsFromHistory as removePathsFromHistoryEntries } from "./utils/history-utils"

let tabIdCounter = 0

const MAX_HISTORY_LENGTH = 50
const MAX_PERSISTED_LAST_OPENED_FILE_PATHS = 5

export type TabSliceDependencies = {
	readTextFile: (path: string) => Promise<string>
	renameFile: (oldPath: string, newPath: string) => Promise<void>
	saveSettings: (
		workspacePath: string,
		settings: Partial<WorkspaceSettings>,
	) => Promise<void>
}

export type Tab = {
	id: number
	path: string
	name: string
	content: string
	syncedName?: string | null
}

export type TabHistoryPoint = {
	path: number[]
	offset: number
}

export type TabHistorySelection = {
	anchor: TabHistoryPoint
	focus: TabHistoryPoint
} | null

export type TabHistoryEntry = {
	path: string
	selection: TabHistorySelection
}

export type PendingHistorySelectionRestoreResult =
	| {
			found: false
	  }
	| {
			found: true
			selection: TabHistorySelection
	  }

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

export type OpenTabSnapshot = {
	path: string
	isSaved: boolean
}

export type TabSaveStateMap = Record<number, boolean>

export type TabSlice = {
	tabs: Tab[]
	activeTabId: number | null
	tabSaveStates: TabSaveStateMap
	history: TabHistoryEntry[]
	historyIndex: number
	setHistorySelectionProvider: (
		provider: (() => TabHistorySelection) | null,
	) => void
	consumePendingHistorySelectionRestore: (
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
	closeTab: (path: string) => void
	closeAllTabs: () => void
	renameTab: (
		oldPath: string,
		newPath: string,
		options?: RenameTabOptions,
	) => Promise<void>
	setTabSaved: (tabId: number, isSaved: boolean) => void
	setActiveTabSyncedName: (name: string) => void
	clearActiveTabSyncedName: () => void
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

type TabStateWithActive = Pick<TabSlice, "tabs" | "activeTabId">

const getTabSavedFromState = (
	state: Pick<TabSlice, "tabSaveStates">,
	tabId: number,
): boolean => state.tabSaveStates[tabId] ?? true

const getActiveTabFromState = (state: TabStateWithActive): Tab | null => {
	if (state.activeTabId === null) {
		return null
	}

	return state.tabs.find((tab) => tab.id === state.activeTabId) ?? null
}

const getActiveTabSavedFromState = (
	state: Pick<TabSlice, "tabs" | "activeTabId" | "tabSaveStates">,
): boolean => {
	const activeTab = getActiveTabFromState(state)
	if (!activeTab) {
		return true
	}

	return getTabSavedFromState(state, activeTab.id)
}

const buildEmptyTabState = (): Pick<
	TabSlice,
	"tabs" | "activeTabId" | "tabSaveStates"
> => ({
	tabs: [],
	activeTabId: null,
	tabSaveStates: {},
})

const findTabIndexByPath = (
	state: Pick<TabSlice, "tabs">,
	path: string,
): number => state.tabs.findIndex((tab) => tab.path === path)

const removeTabSaveState = (
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

const selectFallbackActiveTabId = (
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

const dedupePathsPreservingLastOccurrence = (
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

const buildPersistedLastOpenedFilePaths = (
	state: Pick<TabSlice, "tabs" | "activeTabId" | "history">,
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

	return historyPaths.slice(-MAX_PERSISTED_LAST_OPENED_FILE_PATHS)
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
		let historySelectionProvider: (() => TabHistorySelection) | null = null
		let pendingHistorySelectionRestore: {
			path: string
			selection: TabHistorySelection
		} | null = null
		let lastOpenedFileHistoryPersistQueue: Promise<void> = Promise.resolve()
		const pendingExternalReloadSaveSkipTabIds = new Set<number>()

		const readCurrentHistorySelection = (): TabHistorySelection => {
			if (!historySelectionProvider) {
				return null
			}

			try {
				return cloneHistorySelection(historySelectionProvider())
			} catch {
				return null
			}
		}

		const updateCurrentHistorySelection = (selection: TabHistorySelection) => {
			set((state) => {
				if (
					state.historyIndex < 0 ||
					state.historyIndex >= state.history.length ||
					areHistorySelectionsEqual(
						state.history[state.historyIndex].selection,
						selection,
					)
				) {
					return {}
				}

				const nextHistory = [...state.history]
				nextHistory[state.historyIndex] = {
					...nextHistory[state.historyIndex],
					selection,
				}

				return {
					history: nextHistory,
				}
			})
		}

		const commitCurrentHistorySelection = () => {
			updateCurrentHistorySelection(readCurrentHistorySelection())
		}

		const queuePendingHistorySelectionRestore = (
			path: string,
			selection: TabHistorySelection,
		) => {
			pendingHistorySelectionRestore = {
				path,
				selection: cloneHistorySelection(selection),
			}
		}

		const clearPendingHistorySelectionRestore = () => {
			pendingHistorySelectionRestore = null
		}

		const updateActiveTab = (
			updater: (tab: Tab) => Tab | null,
		): Pick<TabSlice, "tabs"> | {} => {
			const state = get()
			const activeTab = getActiveTabFromState(state)
			if (!activeTab) {
				return {}
			}

			const tabIndex = findTabIndexByPath(state, activeTab.path)
			if (tabIndex === -1) {
				return {}
			}

			const nextTab = updater(activeTab)
			if (!nextTab) {
				return {}
			}

			const nextTabs = [...state.tabs]
			nextTabs[tabIndex] = nextTab
			return {
				tabs: nextTabs,
			}
		}

		const updateHistoryForOpenedTab = (path: string) => {
			const state = get()
			const nextHistoryState = appendHistoryEntry(
				state.history,
				state.historyIndex,
				{
					path,
					selection: null,
				},
				MAX_HISTORY_LENGTH,
			)

			if (!nextHistoryState.didChange) {
				return
			}

			set({
				history: nextHistoryState.history,
				historyIndex: nextHistoryState.historyIndex,
			})
		}

		const buildLastOpenedFileHistoryPersistInput = (): {
			workspacePath: string
			lastOpenedFilePaths: string[]
		} | null => {
			const workspacePath = get().workspacePath
			if (!workspacePath) {
				return null
			}

			return {
				workspacePath,
				lastOpenedFilePaths: buildPersistedLastOpenedFilePaths(get()).map(
					(path) => relative(workspacePath, path),
				),
			}
		}

		const persistLastOpenedFileHistory = async (input: {
			workspacePath: string
			lastOpenedFilePaths: string[]
		}) => {
			await saveSettings(input.workspacePath, {
				lastOpenedFilePaths: input.lastOpenedFilePaths,
			})
		}

		const enqueuePersistLastOpenedFileHistory = (): Promise<void> => {
			const persistInput = buildLastOpenedFileHistoryPersistInput()
			if (!persistInput) {
				return Promise.resolve()
			}

			const persistTask = lastOpenedFileHistoryPersistQueue
				.catch(() => {})
				.then(() => persistLastOpenedFileHistory(persistInput))

			lastOpenedFileHistoryPersistQueue = persistTask
			return persistTask
		}

		const persistLastOpenedFileHistorySafely = () => {
			void enqueuePersistLastOpenedFileHistory().catch((error) => {
				console.error("Failed to persist last opened file history:", error)
			})
		}

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
				persistLastOpenedFileHistorySafely()
			}

			return didChange
		}

		const trackOpenedTab = async (path: string, skipHistory: boolean) => {
			if (skipHistory) {
				return
			}

			updateHistoryForOpenedTab(path)
			await enqueuePersistLastOpenedFileHistory()
		}

		const navigateHistory = async (
			delta: -1 | 1,
			direction: "back" | "forward",
		): Promise<boolean> => {
			const state = get()
			const navigationTarget = getHistoryNavigationTarget(
				state.history,
				state.historyIndex,
				delta,
			)

			if (!navigationTarget) {
				return false
			}

			commitCurrentHistorySelection()
			queuePendingHistorySelectionRestore(
				navigationTarget.targetEntry.path,
				navigationTarget.targetEntry.selection,
			)

			set({ historyIndex: navigationTarget.historyIndex })

			try {
				await get().openTab(navigationTarget.targetEntry.path, true, false, {
					skipSelectionCapture: true,
				})
				return true
			} catch (error) {
				clearPendingHistorySelectionRestore()
				console.error(`Failed to go ${direction} in history:`, error)
				return false
			}
		}

		return {
			...buildEmptyTabState(),
			history: [],
			historyIndex: -1,
			setHistorySelectionProvider: (provider) => {
				historySelectionProvider = provider
			},
			consumePendingHistorySelectionRestore: (path) => {
				if (
					!pendingHistorySelectionRestore ||
					pendingHistorySelectionRestore.path !== path
				) {
					return { found: false }
				}

				const selection = cloneHistorySelection(
					pendingHistorySelectionRestore.selection,
				)
				clearPendingHistorySelectionRestore()
				return { found: true, selection }
			},
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
						? readCurrentHistorySelection()
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
					let nextActiveTabId = currentState.activeTabId
					let nextTabSaveStates = currentState.tabSaveStates

					if (currentState.activeTabId === currentTab.id) {
						pendingExternalReloadSaveSkipTabIds.add(currentTab.id)
						const nextTab = {
							...currentTab,
							id: ++tabIdCounter,
							content,
						}
						nextTabs[currentIndex] = nextTab
						nextActiveTabId = nextTab.id
						nextTabSaveStates = {
							...removeTabSaveState(currentState.tabSaveStates, currentTab.id),
							[nextTab.id]: true,
						}
					} else {
						nextTabs[currentIndex] = {
							...currentTab,
							content,
						}
						nextTabSaveStates = {
							...currentState.tabSaveStates,
							[currentTab.id]: true,
						}
					}

					return {
						tabs: nextTabs,
						activeTabId: nextActiveTabId,
						tabSaveStates: nextTabSaveStates,
					}
				})

				if (!didRefresh || !isActiveTab || !options?.preserveSelection) {
					return
				}

				updateCurrentHistorySelection(nextSelection)
				queuePendingHistorySelectionRestore(path, nextSelection)
			},
			consumePendingExternalReloadSaveSkip: (tabId) => {
				const shouldSkip = pendingExternalReloadSaveSkipTabIds.has(tabId)
				if (shouldSkip) {
					pendingExternalReloadSaveSkipTabIds.delete(tabId)
				}
				return shouldSkip
			},
			hydrateFromOpenedFiles: async (paths: string[]) => {
				const validPaths = paths
					.filter((path) => path.endsWith(".md"))
					.slice(0, MAX_HISTORY_LENGTH)

				if (validPaths.length === 0) {
					return false
				}

				const limitedHistory = validPaths.map<TabHistoryEntry>((path) => ({
					path,
					selection: null,
				}))
				const uniquePaths = dedupePathsPreservingLastOccurrence(validPaths)
				const activePath = limitedHistory[limitedHistory.length - 1]?.path
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

								const nextTabId = ++tabIdCounter
								const content = await readTextFile(currentPath)
								return {
									id: nextTabId,
									path: currentPath,
									name,
									content,
								}
							}),
						)
					).filter((tab): tab is Tab => tab !== null)

					const activeTab = tabs.find((tab) => tab.path === activePath)
					if (!activeTab) {
						return false
					}

					pendingExternalReloadSaveSkipTabIds.clear()
					const activeIndex = limitedHistory.length - 1
					const tabSaveStates = Object.fromEntries(
						tabs.map((tab) => [tab.id, true]),
					) as TabSaveStateMap

					set({
						tabs,
						activeTabId: activeTab.id,
						tabSaveStates,
						history: limitedHistory,
						historyIndex: activeIndex,
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
				const existingIndex = findTabIndexByPath(state, path)

				// If opening the same tab, don't do anything (unless force is true)
				if (!force && activeTab?.path === path) {
					return
				}

				if (existingIndex !== -1 && !force) {
					set((currentState) => {
						const currentIndex = findTabIndexByPath(currentState, path)
						if (currentIndex === -1) {
							return {}
						}

						const currentTab = currentState.tabs[currentIndex]
						return {
							activeTabId: currentTab.id,
						}
					})

					await trackOpenedTab(path, skipHistory)
					return
				}

				const content =
					options?.initialContent !== undefined
						? options.initialContent
						: await readTextFile(path)
				const name = getFileNameWithoutExtension(path)

				if (name) {
					const nextTab = {
						id: ++tabIdCounter,
						path,
						name,
						content,
					}
					set((currentState) => {
						const currentIndex = findTabIndexByPath(currentState, path)
						if (currentIndex !== -1) {
							const currentTab = currentState.tabs[currentIndex]
							const nextTabs = [...currentState.tabs]
							nextTabs[currentIndex] = nextTab
							const nextTabSaveStates = {
								...removeTabSaveState(
									currentState.tabSaveStates,
									currentTab.id,
								),
								[nextTab.id]: true,
							}

							return {
								tabs: nextTabs,
								activeTabId: nextTab.id,
								tabSaveStates: nextTabSaveStates,
							}
						}

						return {
							tabs: [...currentState.tabs, nextTab],
							activeTabId: nextTab.id,
							tabSaveStates: {
								...currentState.tabSaveStates,
								[nextTab.id]: true,
							},
						}
					})

					await trackOpenedTab(path, skipHistory)
				}
			},
			closeTab: (path) => {
				setAndPersistLastOpenedFileHistory((state) => {
					const tabIndex = findTabIndexByPath(state, path)
					if (tabIndex === -1) {
						return {}
					}

					const tab = state.tabs[tabIndex]
					pendingExternalReloadSaveSkipTabIds.delete(tab.id)
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
			},
			closeAllTabs: () => {
				pendingExternalReloadSaveSkipTabIds.clear()
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
						let nextActiveTabId = state.activeTabId
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

							let nextId = currentTab.id
							let nextContent = currentTab.content
							const currentIsSaved = getTabSavedFromState(state, currentTab.id)

							if (refreshContent && currentTab.path === oldPath) {
								nextId = ++tabIdCounter
								if (refreshedContent !== null) {
									nextContent = refreshedContent
								}
								nextTabSaveStates = {
									...removeTabSaveState(nextTabSaveStates, currentTab.id),
									[nextId]: currentIsSaved,
								}
								if (nextActiveTabId === currentTab.id) {
									nextActiveTabId = nextId
								}
							}

							nextTabs[index] = {
								...currentTab,
								id: nextId,
								path: nextPath,
								name: nextName,
								content: nextContent,
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
							activeTabId: nextActiveTabId,
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
			setActiveTabSyncedName: (name) => {
				set(() =>
					updateActiveTab((activeTab) =>
						(activeTab.syncedName ?? null) === name
							? null
							: {
									...activeTab,
									syncedName: name,
								},
					),
				)
			},
			clearActiveTabSyncedName: () => {
				set(() =>
					updateActiveTab((activeTab) =>
						activeTab.syncedName == null
							? null
							: {
									...activeTab,
									syncedName: null,
								},
					),
				)
			},
			goBack: async () => navigateHistory(-1, "back"),
			goForward: async () => navigateHistory(1, "forward"),
			canGoBack: () => {
				const state = get()
				return state.historyIndex > 0
			},
			canGoForward: () => {
				const state = get()
				return state.historyIndex < state.history.length - 1
			},
			getActiveTab: () => getActiveTabFromState(get()),
			getOpenTabSnapshots: () => {
				const { tabs, tabSaveStates } = get()
				return tabs.map((tab) => ({
					path: tab.path,
					isSaved: getTabSavedFromState({ tabSaveStates }, tab.id),
				}))
			},
			getActiveTabPath: () => getActiveTabFromState(get())?.path ?? null,
			getIsSaved: () => getActiveTabSavedFromState(get()),
			updateHistoryPath: (oldPath: string, newPath: string) => {
				setAndPersistLastOpenedFileHistory((state) => ({
					history: replaceHistoryPath(state.history, oldPath, newPath),
				}))
			},
			removePathsFromHistory: (paths) => {
				const state = get()
				const { history, historyIndex } = removePathsFromHistoryEntries(
					state.history,
					state.historyIndex,
					paths,
				)
				const removedTabs = state.tabs.filter((tab) =>
					paths.some((path) => isPathEqualOrDescendant(tab.path, path)),
				)
				const removedTabIds = new Set(removedTabs.map((tab) => tab.id))
				const activeTab = getActiveTabFromState(state)
				const isCurrentTabDeleted =
					!!activeTab && removedTabIds.has(activeTab.id)

				if (removedTabs.length === 0) {
					set({
						history,
						historyIndex,
					})
					return
				}

				for (const removedTab of removedTabs) {
					pendingExternalReloadSaveSkipTabIds.delete(removedTab.id)
				}

				setAndPersistLastOpenedFileHistory((currentState) => {
					const nextTabs = currentState.tabs.filter(
						(tab) => !removedTabIds.has(tab.id),
					)
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
						history,
						historyIndex: history.length > 0 ? historyIndex : -1,
					}
				})

				if (!isCurrentTabDeleted || history.length === 0) {
					return
				}

				const targetPath = history[historyIndex]?.path
				if (!targetPath) {
					return
				}

				get()
					.openTab(targetPath, true, false, {
						skipSelectionCapture: true,
					})
					.catch((error) => {
						console.error("Failed to navigate after deletion:", error)
					})
			},
			clearHistory: () => {
				clearPendingHistorySelectionRestore()
				set({
					history: [],
					historyIndex: -1,
				})
			},
		}
	}
