import {
	createLocalMutationJournal,
	DEFAULT_LOCAL_MUTATION_TTL_MS,
} from "@mdit/local-fs-origin"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
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
import type { CollectionSlice } from "../collection/collection-slice"
import type { GitSyncSlice } from "../git-sync/git-sync-slice"
import type { TabSlice } from "../tab/tab-slice"
import {
	createDirectoryUiActions,
	type WorkspaceDirectoryUiActions,
} from "./directory-ui"
import {
	createEntrySessionActions,
	type WorkspaceEntrySessionActions,
} from "./entry-session"
import { createFsActions, type WorkspaceFsActions } from "./fs"
import {
	createLifecycleActions,
	type WorkspaceLifecycleActions,
} from "./lifecycle"
import { createTreeActions, type WorkspaceTreeActions } from "./tree"
import { createWatchActions, type WorkspaceWatchActions } from "./watch"
import type { WorkspaceActionContext } from "./workspace-action-context"
import type {
	BacklinkEntry,
	FrontmatterUtils,
	ResolveWikiLinkResult,
	WorkspaceDependencies,
} from "./workspace-dependencies"
import { createWorkspacePorts } from "./workspace-ports"
import type { WorkspaceState } from "./workspace-state"
import { buildWorkspaceState } from "./workspace-state"

export type { WorkspaceEntry } from "./workspace-state"

export type WorkspaceActions = WorkspaceTreeActions &
	WorkspaceDirectoryUiActions &
	WorkspaceLifecycleActions &
	WorkspaceFsActions &
	WorkspaceEntrySessionActions &
	WorkspaceWatchActions

export type WorkspaceSlice = WorkspaceState & WorkspaceActions

type WorkspaceSliceStoreState = WorkspaceSlice &
	TabSlice &
	CollectionSlice &
	GitSyncSlice

export const prepareWorkspaceSlice =
	(
		dependencies: WorkspaceDependencies,
	): StateCreator<WorkspaceSliceStoreState, [], [], WorkspaceSlice> =>
	(set, get) => {
		const originJournal = createLocalMutationJournal({
			defaultTtlMs: DEFAULT_LOCAL_MUTATION_TTL_MS,
		})
		const actionContext: WorkspaceActionContext<WorkspaceSliceStoreState> = {
			set,
			get,
			deps: dependencies,
			ports: createWorkspacePorts(get),
			runtime: {
				originJournal,
			},
		}

		return {
			...buildWorkspaceState({ isLoading: true }),
			...createTreeActions(actionContext),
			...createDirectoryUiActions(actionContext),
			...createLifecycleActions(actionContext),
			...createFsActions(actionContext),
			...createEntrySessionActions(actionContext),
			...createWatchActions(actionContext),
		}
	}

const frontmatterUtils: FrontmatterUtils = {
	updateFileFrontmatter,
	renameFileFrontmatterProperty,
	removeFileFrontmatterProperty,
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
	frontmatterUtils,
	toast,
	linkIndexing: {
		getBacklinks: (workspacePath: string, filePath: string) =>
			invoke<BacklinkEntry[]>("get_backlinks_command", {
				workspacePath,
				filePath,
			}),
		resolveWikiLink: ({
			workspacePath,
			currentNotePath,
			rawTarget,
		}: {
			workspacePath: string
			currentNotePath?: string | null
			rawTarget: string
		}) =>
			invoke<ResolveWikiLinkResult>("resolve_wiki_link_command", {
				workspacePath,
				currentNotePath,
				rawTarget,
			}),
		indexNote: (workspacePath: string, notePath: string) =>
			invoke<void>("index_note_command", {
				workspacePath,
				notePath,
				includeEmbeddings: false,
			}),
		renameIndexedNote: (
			workspacePath: string,
			oldNotePath: string,
			newNotePath: string,
		) =>
			invoke<boolean>("rename_indexed_note_command", {
				workspacePath,
				oldNotePath,
				newNotePath,
			}),
		deleteIndexedNote: (workspacePath: string, notePath: string) =>
			invoke<boolean>("delete_indexed_note_command", {
				workspacePath,
				notePath,
			}),
	},
})
