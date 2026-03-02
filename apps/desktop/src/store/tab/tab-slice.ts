import { readTextFile, rename as renameFile } from "@tauri-apps/plugin-fs"
import { relative } from "pathe"
import type { StateCreator } from "zustand"
import type { WorkspaceSettings } from "@/lib/settings-utils"
import { saveSettings } from "@/lib/settings-utils"
import {
	getFileNameWithoutExtension,
	isPathEqualOrDescendant,
} from "@/utils/path-utils"
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

type LinkedTab = {
	path: string
	name: string
} | null

export type TabSlice = {
	tab: Tab | null
	linkedTab: LinkedTab
	isSaved: boolean
	history: TabHistoryEntry[]
	historyIndex: number
	setHistorySelectionProvider: (
		provider: (() => TabHistorySelection) | null,
	) => void
	consumePendingHistorySelectionRestore: (
		path: string,
	) => PendingHistorySelectionRestoreResult
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
	setTabSaved: (isSaved: boolean) => void
	setLinkedTab: (linkedTab: LinkedTab) => void
	updateLinkedName: (name: string) => void
	clearLinkedTab: () => void
	goBack: () => Promise<boolean>
	goForward: () => Promise<boolean>
	canGoBack: () => boolean
	canGoForward: () => boolean
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
		let historySelectionProvider: (() => TabHistorySelection) | null = null
		let pendingHistorySelectionRestore: {
			path: string
			selection: TabHistorySelection
		} | null = null

		const commitCurrentHistorySelection = () => {
			if (!historySelectionProvider) {
				return
			}

			let selection: TabHistorySelection
			try {
				selection = cloneHistorySelection(historySelectionProvider())
			} catch {
				return
			}

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

		const queuePendingHistorySelectionRestore = (entry: TabHistoryEntry) => {
			pendingHistorySelectionRestore = {
				path: entry.path,
				selection: cloneHistorySelection(entry.selection),
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

		const persistLastOpenedNotePath = async (path: string) => {
			const workspacePath = get().workspacePath
			if (!workspacePath) {
				return
			}

			const relativePath = relative(workspacePath, path)
			await saveSettings(workspacePath, {
				lastOpenedNotePath: relativePath,
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
			queuePendingHistorySelectionRestore(navigationTarget.targetEntry)

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
			tab: null,
			linkedTab: null,
			isSaved: true,
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
			hydrateFromOpenedFiles: async (paths: string[]) => {
				const validPaths = paths.filter((path) => path.endsWith(".md"))

				if (validPaths.length === 0) {
					return false
				}

				const initialPath = validPaths[0]
				const name = getFileNameWithoutExtension(initialPath)

				if (!name) {
					return false
				}

				try {
					const content = await readTextFile(initialPath)
					const limitedHistory = validPaths
						.slice(0, MAX_HISTORY_LENGTH)
						.map<TabHistoryEntry>((path) => ({
							path,
							selection: null,
						}))
					const initialIndex = Math.max(
						0,
						limitedHistory.findIndex((entry) => entry.path === initialPath),
					)

					set({
						tab: { id: ++tabIdCounter, path: initialPath, name, content },
						linkedTab: null,
						isSaved: true,
						history: limitedHistory,
						historyIndex: initialIndex,
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

				// If opening the same tab, don't do anything (unless force is true)
				if (!force && state.tab?.path === path) {
					return
				}

				const content =
					options?.initialContent !== undefined
						? options.initialContent
						: await readTextFile(path)
				const name = getFileNameWithoutExtension(path)

				if (name) {
					set({
						tab: { id: ++tabIdCounter, path, name, content },
						linkedTab: null,
						isSaved: true,
					})

					if (!skipHistory) {
						updateHistoryForOpenedTab(path)
						await persistLastOpenedNotePath(path)
					}
				}
			},
			closeTab: (path) => {
				const tab = get().tab

				if (!tab || tab.path !== path) {
					return
				}

				set({ tab: null })
			},
			renameTab: async (oldPath, newPath, options) => {
				const refreshContent = options?.refreshContent ?? false
				const shouldRenameOnFs = options?.renameOnFs ?? false
				const tab = get().tab

				if (!tab || tab.path !== oldPath) {
					return
				}

				if (shouldRenameOnFs && oldPath !== newPath) {
					try {
						await renameFile(oldPath, newPath)
						const nextName = getFileNameWithoutExtension(newPath)
						const { linkedTab } = get()
						const tab = get().tab
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
							tab: nextTab,
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
					set({ tab: null, linkedTab: null })
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
					tab: nextTab,
					linkedTab: shouldCarryLinked
						? {
								...linkedTab,
								path: newPath,
							}
						: state.linkedTab,
				}))
			},
			setTabSaved: (isSaved) => {
				set({
					isSaved,
				})
			},
			setLinkedTab: (linkedTab) => {
				set({ linkedTab })
			},
			updateLinkedName: (name) => {
				const { tab, linkedTab } = get()

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
				const tabPath = state.tab?.path
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
							set({ tab: null })
							return
						}

						get()
							.openTab(targetPath, true, false, {
								skipSelectionCapture: true,
							})
							.catch((error) => {
								console.error("Failed to navigate after deletion:", error)
								set({ tab: null })
							})
					} else {
						set({
							tab: null,
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

export const createTabSlice = prepareTabSlice({
	readTextFile,
	renameFile,
	saveSettings,
})
