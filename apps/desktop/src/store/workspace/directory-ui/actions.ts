import { normalizePathSeparators } from "@/utils/path-utils"
import { findEntryByPath } from "../tree/domain/entry-tree"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceEntry } from "../workspace-state"
import {
	filterPinsForWorkspace,
	normalizePinnedDirectoriesList,
} from "./domain/pinned-directories-helpers"
import { toggleExpandedDirectory } from "./helpers/expanded-directories"
import {
	persistExpandedDirectoriesIfChanged,
	persistPinnedDirectoriesIfChanged,
} from "./runtime/persistence"
import {
	type SyncWorkspaceDirectoryUiStateOptions,
	syncWorkspaceDirectoryUiStateWithEntries,
} from "./state-sync"

export type WorkspaceDirectoryUiActions = {
	syncDirectoryUiStateWithEntries: (input: {
		workspacePath: string
		nextEntries: WorkspaceEntry[]
		options?: SyncWorkspaceDirectoryUiStateOptions
	}) => Promise<void>
	setExpandedDirectories: (next: Set<string> | string[]) => Promise<void>
	expandDirectory: (path: string) => Promise<void>
	collapseDirectory: (path: string) => Promise<void>
	toggleDirectory: (path: string) => Promise<void>
	pinDirectory: (path: string) => Promise<void>
	unpinDirectory: (path: string) => Promise<void>
}

const toExpandedDirectoryList = (next: Set<string> | string[]) =>
	Array.isArray(next) ? next : [...next]

export const createDirectoryUiActions = (
	ctx: WorkspaceActionContext,
): WorkspaceDirectoryUiActions => ({
	syncDirectoryUiStateWithEntries: async (input: {
		workspacePath: string
		nextEntries: WorkspaceEntry[]
		options?: SyncWorkspaceDirectoryUiStateOptions
	}) => {
		await syncWorkspaceDirectoryUiStateWithEntries(
			ctx,
			input.workspacePath,
			input.nextEntries,
			input.options,
		)
	},

	setExpandedDirectories: async (next) => {
		const { workspacePath, expandedDirectories } = ctx.get()
		if (!workspacePath) throw new Error("Workspace path is not set")

		await persistExpandedDirectoriesIfChanged(
			ctx,
			workspacePath,
			expandedDirectories,
			toExpandedDirectoryList(next),
		)
	},

	expandDirectory: async (path: string) => {
		const { expandedDirectories } = ctx.get()
		if (expandedDirectories.includes(path)) {
			return
		}

		await ctx.get().setExpandedDirectories([...expandedDirectories, path])
	},

	collapseDirectory: async (path: string) => {
		const { expandedDirectories } = ctx.get()
		if (!expandedDirectories.includes(path)) {
			return
		}

		await ctx
			.get()
			.setExpandedDirectories(
				expandedDirectories.filter((entry) => entry !== path),
			)
	},

	toggleDirectory: async (path: string) => {
		const { expandedDirectories } = ctx.get()

		await ctx
			.get()
			.setExpandedDirectories(
				toggleExpandedDirectory(expandedDirectories, path),
			)
	},

	pinDirectory: async (path: string) => {
		const workspacePath = ctx.get().workspacePath
		if (!workspacePath) {
			return
		}

		const withinWorkspace = filterPinsForWorkspace([path], workspacePath)
		if (withinWorkspace.length === 0) {
			return
		}

		const isDirectory =
			path === workspacePath ||
			!!findEntryByPath(ctx.get().entries, path)?.isDirectory
		if (!isDirectory) {
			return
		}

		const prevPinned = ctx.get().pinnedDirectories
		const nextPinned = normalizePinnedDirectoriesList([...prevPinned, path])

		await persistPinnedDirectoriesIfChanged(
			ctx,
			workspacePath,
			prevPinned,
			nextPinned,
		)
	},

	unpinDirectory: async (path: string) => {
		const workspacePath = ctx.get().workspacePath
		if (!workspacePath) {
			return
		}

		const normalizedPath = normalizePathSeparators(path)
		const prevPinned = ctx.get().pinnedDirectories
		const nextPinned = normalizePinnedDirectoriesList(
			prevPinned.filter(
				(entry) => normalizePathSeparators(entry) !== normalizedPath,
			),
		)

		await persistPinnedDirectoriesIfChanged(
			ctx,
			workspacePath,
			prevPinned,
			nextPinned,
		)
	},
})
