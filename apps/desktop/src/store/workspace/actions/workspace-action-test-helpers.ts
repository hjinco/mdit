import { vi } from "vitest"
import type { WorkspaceActionContext } from "../workspace-action-context"
import { buildWorkspaceState } from "../workspace-state"

export function createWorkspaceActionTestContext() {
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
		generateText: vi.fn().mockResolvedValue({ text: "renamed-note" }),
		frontmatterUtils: {
			updateFileFrontmatter: vi.fn().mockResolvedValue(undefined),
			renameFileFrontmatterProperty: vi.fn().mockResolvedValue(undefined),
			removeFileFrontmatterProperty: vi.fn().mockResolvedValue(undefined),
		},
		toast: {
			success: vi.fn(),
			error: vi.fn(),
		},
		aiRenameHelpers: {
			AI_RENAME_SYSTEM_PROMPT: "rename-system-prompt",
			buildRenamePrompt: vi.fn().mockReturnValue("prompt"),
			collectSiblingNoteNames: vi.fn().mockReturnValue([]),
			createModelFromConfig: vi.fn().mockReturnValue({}),
			extractAndSanitizeName: vi.fn().mockReturnValue("renamed-note"),
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
			indexNote: vi.fn().mockResolvedValue(undefined),
			renameIndexedNote: vi.fn().mockResolvedValue(false),
		},
	}

	const ports = {
		tab: {
			openTab: vi.fn().mockResolvedValue(undefined),
			closeTab: vi.fn(),
			renameTab: vi.fn().mockResolvedValue(undefined),
			updateHistoryPath: vi.fn(),
			removePathFromHistory: vi.fn(),
			clearHistory: vi.fn(),
		},
		collection: {
			refreshCollectionEntries: vi.fn(),
			onEntryCreated: vi.fn(),
			onEntriesDeleted: vi.fn(),
			onEntryRenamed: vi.fn(),
			onEntryMoved: vi.fn(),
			resetCollectionPath: vi.fn(),
		},
		gitSync: {
			initGitSync: vi.fn().mockResolvedValue(undefined),
		},
	}

	let state: any = {
		...buildWorkspaceState(),
		isSaved: true,
		tab: null,
		currentCollectionPath: null,
		renameConfig: null,
		refreshCodexOAuthForTarget: vi.fn().mockResolvedValue(undefined),
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
		createNote: vi.fn().mockResolvedValue("/ws/Untitled.md"),
		deleteEntries: vi.fn(),
		renameEntry: vi.fn(),
		recordFsOperation: vi.fn(() => {
			state = { ...state, lastFsOperationTime: Date.now() }
		}),
		updateEntryModifiedDate: vi.fn(),
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
	}

	return {
		context,
		deps,
		ports,
		getState: () => state,
		setState: (patch: Record<string, unknown>) => {
			state = { ...state, ...patch }
		},
	}
}
