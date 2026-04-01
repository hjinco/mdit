import {
	getFileNameWithoutExtension,
	isPathEqualOrDescendant,
} from "@mdit/utils/path-utils"
import { relative } from "pathe"
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
}

type OpenTabOptions = {
	initialContent?: string
	skipSelectionCapture?: boolean
}

type RefreshTabFromExternalContentOptions = {
	preserveSelection?: boolean
}

type LinkedTab = {
	path: string
	name: string
} | null

export type OpenTabSnapshot = {
	path: string
	isSaved: boolean
}

export type TabSaveStateMap = Record<number, boolean>

export type TabSlice = {
	tabs: Tab[]
	activeTabId: number | null
	tabSaveStates: TabSaveStateMap
	linkedTab: LinkedTab
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
	renameTab: (
		oldPath: string,
		newPath: string,
		options?: RenameTabOptions,
	) => Promise<void>
	setTabSaved: (tabId: number, isSaved: boolean) => void
	setLinkedTab: (linkedTab: LinkedTab) => void
	updateLinkedName: (name: string) => void
	clearLinkedTab: () => void
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

const buildSingleActiveTabState = (
	tab: Tab | null,
	isSaved = true,
): Pick<TabSlice, "tabs" | "activeTabId" | "tabSaveStates"> =>
	tab
		? {
				tabs: [tab],
				activeTabId: tab.id,
				tabSaveStates: { [tab.id]: isSaved },
			}
		: {
				tabs: [],
				activeTabId: null,
				tabSaveStates: {},
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

		const persistLastOpenedFileHistory = async () => {
			const workspacePath = get().workspacePath
			if (!workspacePath) {
				return
			}

			const relativePaths = get()
				.history.slice(-MAX_PERSISTED_LAST_OPENED_FILE_PATHS)
				.map((entry) => relative(workspacePath, entry.path))

			await saveSettings(workspacePath, {
				lastOpenedFilePaths: relativePaths,
			})
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
			...buildSingleActiveTabState(null),
			linkedTab: null,
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
				const activeTab = getActiveTabFromState(get())
				if (
					!activeTab ||
					activeTab.path !== path ||
					activeTab.content === content
				) {
					return
				}

				const nextSelection = options?.preserveSelection
					? readCurrentHistorySelection()
					: null
				let didRefresh = false

				set((state) => {
					const currentTab = getActiveTabFromState(state)
					if (
						!currentTab ||
						currentTab.path !== path ||
						currentTab.id !== activeTab.id
					) {
						return {}
					}

					didRefresh = true
					pendingExternalReloadSaveSkipTabIds.add(currentTab.id)
					const nextTab = {
						...currentTab,
						id: ++tabIdCounter,
						content,
					}

					return {
						...buildSingleActiveTabState(nextTab, true),
					}
				})

				if (!didRefresh || !options?.preserveSelection) {
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
				const validPaths = paths.filter((path) => path.endsWith(".md"))

				if (validPaths.length === 0) {
					return false
				}

				const limitedHistory = validPaths
					.slice(0, MAX_HISTORY_LENGTH)
					.map<TabHistoryEntry>((path) => ({
						path,
						selection: null,
					}))
				const activePath = limitedHistory[limitedHistory.length - 1]?.path
				if (!activePath) {
					return false
				}

				const name = getFileNameWithoutExtension(activePath)

				if (!name) {
					return false
				}

				try {
					const content = await readTextFile(activePath)
					const activeIndex = limitedHistory.length - 1
					const activeTab = {
						id: ++tabIdCounter,
						path: activePath,
						name,
						content,
					}

					set({
						...buildSingleActiveTabState(activeTab, true),
						linkedTab: null,
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

				// If opening the same tab, don't do anything (unless force is true)
				if (!force && activeTab?.path === path) {
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
					set({
						...buildSingleActiveTabState(nextTab, true),
						linkedTab: null,
					})

					if (!skipHistory) {
						updateHistoryForOpenedTab(path)
						await persistLastOpenedFileHistory()
					}
				}
			},
			closeTab: (path) => {
				const tab = getActiveTabFromState(get())

				if (!tab || tab.path !== path) {
					return
				}

				set(buildSingleActiveTabState(null))
			},
			renameTab: async (oldPath, newPath, options) => {
				const refreshContent = options?.refreshContent ?? false
				const shouldRenameOnFs = options?.renameOnFs ?? false
				const tab = getActiveTabFromState(get())
				const currentTabSaved = getActiveTabSavedFromState(get())

				if (!tab || tab.path !== oldPath) {
					return
				}

				if (shouldRenameOnFs && oldPath !== newPath) {
					try {
						await renameFile(oldPath, newPath)
						const nextName = getFileNameWithoutExtension(newPath)
						const { linkedTab } = get()
						const tab = getActiveTabFromState(get())
						if (!tab) {
							return
						}
						const nextTab = {
							...tab,
							path: newPath,
							name: nextName,
						}
						const shouldCarryLinked = linkedTab && linkedTab.path === oldPath

						set({
							...buildSingleActiveTabState(nextTab, currentTabSaved),
							linkedTab: shouldCarryLinked
								? {
										...linkedTab,
										path: newPath,
									}
								: linkedTab,
						})
						return
					} catch (error) {
						console.error("Failed to rename tab on filesystem:", error)
						throw error
					}
				}

				const name = getFileNameWithoutExtension(newPath)

				if (!name) {
					set({
						...buildSingleActiveTabState(null),
						linkedTab: null,
					})
					return
				}

				let content = tab.content
				let nextId = tab.id

				if (refreshContent) {
					nextId = ++tabIdCounter

					if (newPath.endsWith(".md")) {
						try {
							content = await readTextFile(newPath)
						} catch (error) {
							console.error(
								"Failed to refresh tab content after rename:",
								error,
							)
						}
					}
				}

				const { linkedTab } = get()
				const shouldCarryLinked = linkedTab && linkedTab.path === oldPath
				const nextTab = {
					...tab,
					id: nextId,
					path: newPath,
					name,
					content,
				}

				set((state) => ({
					...state,
					...buildSingleActiveTabState(
						nextTab,
						getActiveTabSavedFromState(state),
					),
					linkedTab: shouldCarryLinked
						? {
								...linkedTab,
								path: newPath,
							}
						: state.linkedTab,
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
			setLinkedTab: (linkedTab) => {
				set({ linkedTab })
			},
			updateLinkedName: (name) => {
				const { linkedTab } = get()
				const tab = getActiveTabFromState(get())

				if (!tab || !linkedTab) {
					return
				}

				const isSameTab = linkedTab.path === tab.path

				if (!isSameTab || linkedTab.name === name) {
					return
				}

				set({ linkedTab: { ...linkedTab, name } })
			},
			clearLinkedTab: () => {
				set({ linkedTab: null })
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
				const state = get()
				set({
					history: replaceHistoryPath(state.history, oldPath, newPath),
				})
			},
			removePathsFromHistory: (paths) => {
				const state = get()
				const { history, historyIndex } = removePathsFromHistoryEntries(
					state.history,
					state.historyIndex,
					paths,
				)
				const tabPath = getActiveTabFromState(state)?.path
				const isCurrentTabDeleted =
					!!tabPath &&
					paths.some((path) => isPathEqualOrDescendant(tabPath, path))

				if (isCurrentTabDeleted) {
					if (history.length > 0) {
						set({
							history,
							historyIndex,
						})

						const targetPath = history[historyIndex]?.path
						if (!targetPath) {
							set(buildSingleActiveTabState(null))
							return
						}

						get()
							.openTab(targetPath, true, false, {
								skipSelectionCapture: true,
							})
							.catch((error) => {
								console.error("Failed to navigate after deletion:", error)
								set(buildSingleActiveTabState(null))
							})
					} else {
						set({
							...buildSingleActiveTabState(null),
							history,
							historyIndex: -1,
						})
					}
				} else {
					set({
						history,
						historyIndex,
					})
				}
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
