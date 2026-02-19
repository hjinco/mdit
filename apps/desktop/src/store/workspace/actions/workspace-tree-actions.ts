import { areStringArraysEqual } from "@/utils/array-utils"
import { normalizePathSeparators } from "@/utils/path-utils"
import {
	buildWorkspaceEntries,
	findEntryByPath,
} from "../helpers/entry-helpers"
import {
	syncExpandedDirectoriesWithEntries,
	toggleExpandedDirectory,
} from "../helpers/expanded-directories-helpers"
import {
	filterPinsForWorkspace,
	filterPinsWithEntries,
	normalizePinnedDirectoriesList,
} from "../helpers/pinned-directories-helpers"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"

export const createWorkspaceTreeActions = (
	ctx: WorkspaceActionContext,
): Pick<
	WorkspaceSlice,
	| "setIsEditMode"
	| "setExpandedDirectories"
	| "updateEntries"
	| "refreshWorkspaceEntries"
	| "pinDirectory"
	| "unpinDirectory"
	| "toggleDirectory"
> => ({
	setIsEditMode: (isEditMode: boolean) => {
		ctx.set({ isEditMode })
	},

	setExpandedDirectories: async (action) => {
		const { workspacePath, expandedDirectories } = ctx.get()
		if (!workspacePath) throw new Error("Workspace path is not set")

		const previousExpanded = expandedDirectories
		const updatedExpanded = action(expandedDirectories)

		ctx.set({
			expandedDirectories: updatedExpanded,
		})

		if (!areStringArraysEqual(previousExpanded, updatedExpanded)) {
			await ctx.deps.settingsRepository.persistExpandedDirectories(
				workspacePath,
				updatedExpanded,
			)
		}
	},

	updateEntries: (entriesOrAction) => {
		const entries =
			typeof entriesOrAction === "function"
				? entriesOrAction(ctx.get().entries)
				: entriesOrAction
		ctx.set({ entries })
		ctx.ports.collection.refreshCollectionEntries()
	},

	refreshWorkspaceEntries: async () => {
		const workspacePath = ctx.get().workspacePath

		if (!workspacePath) throw new Error("Workspace path is not set")

		ctx.set({ isTreeLoading: true })

		try {
			const entries = await buildWorkspaceEntries(
				workspacePath,
				ctx.deps.fileSystemRepository,
			)

			if (ctx.get().workspacePath !== workspacePath) {
				return
			}

			const prevPinned = ctx.get().pinnedDirectories
			const nextPinned = filterPinsWithEntries(
				filterPinsForWorkspace(prevPinned, workspacePath),
				entries,
				workspacePath,
			)
			const pinsChanged = !areStringArraysEqual(prevPinned, nextPinned)

			const syncedExpanded = syncExpandedDirectoriesWithEntries(
				ctx.get().expandedDirectories,
				entries,
			)
			const nextExpanded = syncedExpanded

			ctx.get().updateEntries(entries)
			ctx.set({
				isTreeLoading: false,
				expandedDirectories: syncedExpanded,
				...(pinsChanged ? { pinnedDirectories: nextPinned } : {}),
			})

			await ctx.deps.settingsRepository.persistExpandedDirectories(
				workspacePath,
				nextExpanded,
			)

			if (pinsChanged) {
				await ctx.deps.settingsRepository.persistPinnedDirectories(
					workspacePath,
					nextPinned,
				)
			}
		} catch (error) {
			ctx.set({ isTreeLoading: false })
			throw error
		}
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

		if (nextPinned.length === prevPinned.length) {
			return
		}

		ctx.set({ pinnedDirectories: nextPinned })
		await ctx.deps.settingsRepository.persistPinnedDirectories(
			workspacePath,
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

		if (nextPinned.length === prevPinned.length) {
			return
		}

		ctx.set({ pinnedDirectories: nextPinned })
		await ctx.deps.settingsRepository.persistPinnedDirectories(
			workspacePath,
			nextPinned,
		)
	},

	toggleDirectory: async (path: string) => {
		const { workspacePath, expandedDirectories } = ctx.get()
		if (!workspacePath) throw new Error("Workspace path is not set")

		const updatedExpanded = toggleExpandedDirectory(expandedDirectories, path)
		ctx.set({ expandedDirectories: updatedExpanded })

		await ctx.deps.settingsRepository.persistExpandedDirectories(
			workspacePath,
			updatedExpanded,
		)
	},
})
