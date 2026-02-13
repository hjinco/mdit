import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { generateText } from "ai"
import { toast } from "sonner"
import type { StateCreator } from "zustand"
import { FileSystemRepository } from "@/repositories/file-system-repository"
import { WorkspaceHistoryRepository } from "@/repositories/workspace-history-repository"
import { WorkspaceSettingsRepository } from "@/repositories/workspace-settings-repository"
import {
	removeFileFrontmatterProperty,
	renameFileFrontmatterProperty,
	updateFileFrontmatter,
} from "@/utils/frontmatter-utils"
import type { AISettingsSlice } from "../ai-settings/ai-settings-slice"
import type { CollectionSlice } from "../collection/collection-slice"
import type { GitSyncSlice } from "../git-sync/git-sync-slice"
import type { TabSlice } from "../tab/tab-slice"
import { createWorkspaceEntryActions } from "./actions/workspace-entry-actions"
import { createWorkspaceFsNoteActions } from "./actions/workspace-fs-note-actions"
import { createWorkspaceFsStructureActions } from "./actions/workspace-fs-structure-actions"
import { createWorkspaceFsTransferActions } from "./actions/workspace-fs-transfer-actions"
import { createWorkspaceLifecycleActions } from "./actions/workspace-lifecycle-actions"
import { createWorkspaceSelectionActions } from "./actions/workspace-selection-actions"
import { createWorkspaceTreeActions } from "./actions/workspace-tree-actions"
import { createWorkspaceWatchActions } from "./actions/workspace-watch-actions"
import {
	AI_RENAME_SYSTEM_PROMPT,
	buildRenamePrompt,
	collectSiblingNoteNames,
	createModelFromConfig,
	extractAndSanitizeName,
} from "./helpers/ai-rename-helpers"
import type { WorkspaceActionContext } from "./workspace-action-context"
import type {
	AiRenameHelpers,
	FrontmatterUtils,
	WorkspaceDependencies,
} from "./workspace-dependencies"
import { createWorkspacePorts } from "./workspace-ports"
import type { WorkspaceEntry, WorkspaceState } from "./workspace-state"
import { buildWorkspaceState } from "./workspace-state"

export type { WorkspaceEntry } from "./workspace-state"

export type WorkspaceSlice = WorkspaceState & {
	setIsEditMode: (isEditMode: boolean) => void
	setExpandedDirectories: (
		action: (expandedDirectories: string[]) => string[],
	) => Promise<void>
	updateEntries: (
		entriesOrAction:
			| WorkspaceEntry[]
			| ((entries: WorkspaceEntry[]) => WorkspaceEntry[]),
	) => void
	entryCreated: (input: {
		parentPath: string
		entry: WorkspaceEntry
		expandParent?: boolean
		expandNewDirectory?: boolean
	}) => Promise<void>
	entriesDeleted: (input: { paths: string[] }) => Promise<void>
	entryRenamed: (input: {
		oldPath: string
		newPath: string
		isDirectory: boolean
		newName: string
	}) => Promise<void>
	entryMoved: (input: {
		sourcePath: string
		destinationDirPath: string
		newPath: string
		isDirectory: boolean
		refreshContent?: boolean
	}) => Promise<void>
	entryImported: (input: {
		destinationDirPath: string
		entry: WorkspaceEntry
		expandIfDirectory?: boolean
	}) => Promise<void>
	initializeWorkspace: () => Promise<void>
	setWorkspace: (path: string) => Promise<void>
	openFolderPicker: () => Promise<void>
	refreshWorkspaceEntries: () => Promise<void>
	pinDirectory: (path: string) => Promise<void>
	unpinDirectory: (path: string) => Promise<void>
	toggleDirectory: (path: string) => Promise<void>
	clearWorkspace: () => Promise<void>
	recordFsOperation: () => void
	saveNoteContent: (path: string, contents: string) => Promise<void>
	updateFrontmatter: (
		path: string,
		updates: Record<string, unknown>,
	) => Promise<void>
	renameFrontmatterProperty: (
		path: string,
		oldKey: string,
		newKey: string,
	) => Promise<void>
	removeFrontmatterProperty: (path: string, key: string) => Promise<void>
	createFolder: (
		directoryPath: string,
		folderName: string,
	) => Promise<string | null>
	createNote: (
		directoryPath: string,
		options?: {
			initialName?: string
			initialContent?: string
			openTab?: boolean
		},
	) => Promise<string>
	createAndOpenNote: () => Promise<void>
	deleteEntries: (paths: string[]) => Promise<void>
	deleteEntry: (path: string) => Promise<void>
	renameNoteWithAI: (entry: WorkspaceEntry) => Promise<void>
	renameEntry: (entry: WorkspaceEntry, newName: string) => Promise<string>
	moveEntry: (sourcePath: string, destinationPath: string) => Promise<boolean>
	copyEntry: (sourcePath: string, destinationPath: string) => Promise<boolean>
	moveExternalEntry: (
		sourcePath: string,
		destinationPath: string,
	) => Promise<boolean>
	updateEntryModifiedDate: (path: string) => Promise<void>
	setSelectedEntryPaths: (paths: Set<string>) => void
	setSelectionAnchorPath: (path: string | null) => void
	resetSelection: () => void
	watchWorkspace: () => Promise<void>
	unwatchWorkspace: () => void
}

export const prepareWorkspaceSlice =
	(
		dependencies: WorkspaceDependencies,
	): StateCreator<
		WorkspaceSlice &
			TabSlice &
			CollectionSlice &
			GitSyncSlice &
			AISettingsSlice,
		[],
		[],
		WorkspaceSlice
	> =>
	(set, get) => {
		const actionContext: WorkspaceActionContext = {
			set: set as any,
			get: get as any,
			deps: dependencies,
			ports: createWorkspacePorts(get as any),
		}

		return {
			...buildWorkspaceState({ isLoading: true }),
			...createWorkspaceTreeActions(actionContext),
			...createWorkspaceEntryActions(actionContext),
			...createWorkspaceLifecycleActions(actionContext),
			...createWorkspaceFsNoteActions(actionContext),
			...createWorkspaceFsStructureActions(actionContext),
			...createWorkspaceFsTransferActions(actionContext),
			...createWorkspaceSelectionActions(actionContext),
			...createWorkspaceWatchActions(actionContext),
		}
	}

const frontmatterUtils: FrontmatterUtils = {
	updateFileFrontmatter,
	renameFileFrontmatterProperty,
	removeFileFrontmatterProperty,
}

const aiRenameHelpers: AiRenameHelpers = {
	AI_RENAME_SYSTEM_PROMPT,
	buildRenamePrompt,
	collectSiblingNoteNames,
	createModelFromConfig,
	extractAndSanitizeName,
}

export const createWorkspaceSlice = prepareWorkspaceSlice({
	fileSystemRepository: new FileSystemRepository(),
	settingsRepository: new WorkspaceSettingsRepository(),
	historyRepository: new WorkspaceHistoryRepository(),
	openDialog: async (options) => {
		const result = await open(options)
		return typeof result === "string" ? result : null
	},
	applyWorkspaceMigrations: (workspacePath: string) =>
		invoke<void>("apply_appdata_migrations", { workspacePath }),
	generateText,
	frontmatterUtils,
	toast,
	aiRenameHelpers,
})
