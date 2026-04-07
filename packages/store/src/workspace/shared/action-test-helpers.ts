import type { ResolvedOrigins } from "@mdit/local-fs-origin"
import { vi } from "vitest"
import { createDirectoryUiActions } from "../directory-ui/actions"
import { findEntryByPath } from "../tree/domain/entry-tree"
import { readWorkspaceEntriesFromPath } from "../tree/entry-snapshot-fs"
import type { WorkspaceActionContext } from "../workspace-action-context"
import { buildWorkspaceState } from "../workspace-state"

export function createActionTestContext() {
	const deps = {
		fileSystemRepository: {
			exists: vi.fn().mockResolvedValue(false),
			isExistingDirectory: vi.fn().mockResolvedValue(true),
			mkdir: vi.fn().mockResolvedValue(undefined),
			readDir: vi.fn().mockResolvedValue([]),
			readTextFile: vi.fn().mockResolvedValue(""),
			rename: vi.fn().mockResolvedValue(undefined),
			writeTextFile: vi.fn().mockResolvedValue(undefined),
			moveToTrash: vi.fn().mockResolvedValue(undefined),
			moveManyToTrash: vi.fn().mockResolvedValue(undefined),
			copy: vi.fn().mockResolvedValue(undefined),
			stat: vi.fn().mockResolvedValue({
				isDirectory: false,
				birthtime: undefined,
				mtime: undefined,
			}),
		},
		settingsRepository: {
			loadSettings: vi.fn().mockResolvedValue({}),
			getPinnedDirectoriesFromSettings: vi.fn().mockReturnValue([]),
			getExpandedDirectoriesFromSettings: vi.fn().mockReturnValue([]),
			persistPinnedDirectories: vi.fn().mockResolvedValue(undefined),
			persistExpandedDirectories: vi.fn().mockResolvedValue(undefined),
		},
		historyRepository: {
			listWorkspacePaths: vi.fn().mockResolvedValue([]),
			touchWorkspace: vi.fn().mockResolvedValue(undefined),
			removeWorkspace: vi.fn().mockResolvedValue(undefined),
		},
		openDialog: vi.fn().mockResolvedValue(null),
		applyWorkspaceMigrations: vi.fn().mockResolvedValue(undefined),
		frontmatterUtils: {
			updateFileFrontmatter: vi.fn().mockResolvedValue(undefined),
			renameFileFrontmatterProperty: vi.fn().mockResolvedValue(undefined),
			removeFileFrontmatterProperty: vi.fn().mockResolvedValue(undefined),
		},
		toast: {
			success: vi.fn(),
			error: vi.fn(),
		},
		linkIndexing: {
			getBacklinks: vi.fn().mockResolvedValue([]),
			resolveWikiLink: vi.fn().mockResolvedValue({
				canonicalTarget: "",
				resolvedRelPath: null,
				matchCount: 0,
				disambiguated: false,
				unresolved: true,
			}),
			renameIndexedNote: vi.fn().mockResolvedValue(false),
			deleteIndexedNote: vi.fn().mockResolvedValue(false),
		},
		watcher: {
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
			subscribe: vi.fn().mockResolvedValue(vi.fn()),
		},
	}

	const originJournal = {
		register: vi.fn(),
		resolve: vi.fn(
			(input: { relPaths: string[] }): ResolvedOrigins => ({
				externalRelPaths: input.relPaths,
				localRelPaths: [],
			}),
		),
		prune: vi.fn(),
		clearWorkspace: vi.fn(),
	}
	const events = {
		emit: vi.fn().mockResolvedValue(undefined),
		subscribe: vi.fn(),
	}

	let state: any
	const getOpenTabSnapshotsFromState = () => {
		if (Array.isArray(state.openTabSnapshots)) {
			return state.openTabSnapshots
		}

		if (Array.isArray(state.tabs)) {
			const tabSaveStates =
				state.tabSaveStates && typeof state.tabSaveStates === "object"
					? state.tabSaveStates
					: {}
			return state.tabs.map((tab: { id: number; path: string }) => ({
				path: tab.path,
				isSaved: tabSaveStates[tab.id] ?? true,
			}))
		}

		return []
	}

	const ports = {
		tab: {
			getOpenTabSnapshots: vi.fn(() => getOpenTabSnapshotsFromState()),
			getActiveTabPath: vi.fn(() => {
				const activeTabId =
					typeof state.activeTabId === "number" ? state.activeTabId : null
				const activeTab = Array.isArray(state.tabs)
					? state.tabs.find(
							(tab: { id: number; path: string }) => tab.id === activeTabId,
						)
					: null
				return activeTab?.path ?? null
			}),
		},
	}

	state = {
		...buildWorkspaceState(),
		openTabSnapshots: [],
		chatConfig: null,
		refreshCodexOAuthForTarget: vi.fn().mockResolvedValue(undefined),
		getEntryByPath: vi.fn((path: string) =>
			findEntryByPath(state.entries, path),
		),
		readWorkspaceEntriesFromPath: vi.fn((path: string) =>
			readWorkspaceEntriesFromPath(path, deps.fileSystemRepository),
		),
		updateEntries: vi.fn((entriesOrAction: any) => {
			const nextEntries =
				typeof entriesOrAction === "function"
					? entriesOrAction(state.entries)
					: entriesOrAction
			state = { ...state, entries: nextEntries }
		}),
		entryCreated: vi.fn(),
		entriesDeleted: vi.fn(),
		entryRenamed: vi.fn(),
		entryMoved: vi.fn(),
		entryImported: vi.fn(),
		setWorkspace: vi.fn(),
		openTab: vi.fn().mockResolvedValue(undefined),
		getOpenTabSnapshots: vi.fn(() => ports.tab.getOpenTabSnapshots()),
		getActiveTabPath: vi.fn(() => ports.tab.getActiveTabPath()),
		closeAllTabs: vi.fn(() => {
			state = {
				...state,
				tabs: [],
				activeTabId: null,
				tabSaveStates: {},
				history: [],
				historyIndex: -1,
			}
		}),
		clearHistory: vi.fn(() => {
			state = {
				...state,
				history: [],
				historyIndex: -1,
			}
		}),
		hydrateFromOpenedFiles: vi.fn().mockResolvedValue(true),
		renameTab: vi.fn().mockResolvedValue(undefined),
		updateHistoryPath: vi.fn(),
		removePathsFromHistory: vi.fn(),
		refreshTabFromExternalContent: vi.fn(),
		createNote: vi.fn().mockResolvedValue("/ws/Untitled.md"),
		deleteEntries: vi.fn(),
		renameEntry: vi.fn(),
		registerLocalMutation: vi.fn(),
		updateEntryModifiedDate: vi.fn(),
		setEntrySelection: vi.fn(
			(selection: { selectedIds: Set<string>; anchorId: string | null }) => {
				state = {
					...state,
					selectedEntryPaths: selection.selectedIds,
					selectionAnchorPath: selection.anchorId,
				}
			},
		),
		setSelectedEntryPaths: vi.fn((paths: Set<string>) => {
			state = { ...state, selectedEntryPaths: paths }
		}),
		setSelectionAnchorPath: vi.fn((path: string | null) => {
			state = { ...state, selectionAnchorPath: path }
		}),
		resetSelection: vi.fn(() => {
			state = {
				...state,
				selectedEntryPaths: new Set(),
				selectionAnchorPath: null,
			}
		}),
		refreshWorkspaceEntries: vi.fn().mockResolvedValue(undefined),
		resetCollectionPath: vi.fn(() => {
			state = {
				...state,
				currentCollectionPath: null,
				lastCollectionPath: null,
				collectionEntries: [],
			}
		}),
		refreshCollectionEntries: vi.fn(),
		onEntryCreated: vi.fn(),
		onEntriesDeleted: vi.fn(),
		onEntryRenamed: vi.fn(),
		onEntryMoved: vi.fn(),
		resetIndexingState: vi.fn(),
		getIndexingConfig: vi.fn().mockResolvedValue(null),
	}

	const set: WorkspaceActionContext["set"] = (partial) => {
		const nextPartial = typeof partial === "function" ? partial(state) : partial
		state = { ...state, ...nextPartial }
	}

	const get: WorkspaceActionContext["get"] = () => state

	const context: WorkspaceActionContext = {
		set,
		get,
		deps: deps as any,
		ports: ports as any,
		runtime: {
			originJournal: originJournal as any,
		},
	}
	const directoryUiActions = createDirectoryUiActions(context)

	state = {
		...state,
		...directoryUiActions,
		syncDirectoryUiStateWithEntries: vi.fn(
			async (input: {
				workspacePath: string
				nextEntries: any[]
				options?: {
					persistExpandedWhenUnchanged?: boolean
					previousExpandedDirectories?: string[]
					previousPinnedDirectories?: string[]
				}
			}) =>
				directoryUiActions.syncDirectoryUiStateWithEntries({
					workspacePath: input.workspacePath,
					nextEntries: input.nextEntries,
					options: input.options,
				}),
		),
	}

	return {
		context,
		deps,
		ports,
		events,
		originJournal,
		getState: () => state,
		setState: (patch: Record<string, unknown>) => {
			state = { ...state, ...patch }
		},
	}
}
