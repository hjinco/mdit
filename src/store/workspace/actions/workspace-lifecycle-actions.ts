import { resolve } from "pathe"
import { areStringArraysEqual } from "@/utils/array-utils"
import { isPathEqualOrDescendant } from "@/utils/path-utils"
import { buildWorkspaceEntries } from "../helpers/entry-helpers"
import { syncExpandedDirectoriesWithEntries } from "../helpers/expanded-directories-helpers"
import {
	filterPinsForWorkspace,
	filterPinsWithEntries,
} from "../helpers/pinned-directories-helpers"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"
import { buildWorkspaceState } from "../workspace-state"

const MAX_HISTORY_LENGTH = 5

const resolveUnwatchFnForWorkspaceTransition = (
	ctx: WorkspaceActionContext,
	nextWorkspacePath: string | null,
): WorkspaceSlice["unwatchFn"] => {
	const { workspacePath, unwatchFn } = ctx.get()
	if (!unwatchFn) {
		return null
	}

	if (workspacePath === nextWorkspacePath) {
		return unwatchFn
	}

	unwatchFn()
	return null
}

const restoreLastOpenedNoteFromSettings = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	settings: { lastOpenedNotePath?: string },
) => {
	const relativePath = settings.lastOpenedNotePath
	if (!relativePath) {
		return
	}

	const absolutePath = resolve(workspacePath, relativePath)

	try {
		if (
			isPathEqualOrDescendant(absolutePath, workspacePath) &&
			(await ctx.deps.fileSystemRepository.exists(absolutePath)) &&
			ctx.get().workspacePath === workspacePath
		) {
			ctx.ports.tab.openTab(absolutePath).catch((error) => {
				console.debug("Failed to open last opened note:", error)
			})
		}
	} catch (error) {
		console.debug("Failed to restore last opened note:", error)
	}
}

const bootstrapWorkspace = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	options?: { restoreLastOpenedNote?: boolean },
) => {
	let migrationsComplete = false

	try {
		await ctx.deps.applyWorkspaceMigrations(workspacePath)
		migrationsComplete = true
	} catch (error) {
		console.error("Failed to apply workspace migrations:", error)
		migrationsComplete = false
	}

	if (ctx.get().workspacePath !== workspacePath) {
		return
	}
	ctx.set({ isMigrationsComplete: migrationsComplete })

	try {
		const [settings, entries] = await Promise.all([
			ctx.deps.settingsRepository.loadSettings(workspacePath),
			buildWorkspaceEntries(workspacePath, ctx.deps.fileSystemRepository),
		])

		if (ctx.get().workspacePath !== workspacePath) {
			return
		}

		const pinsFromSettings = filterPinsForWorkspace(
			ctx.deps.settingsRepository.getPinnedDirectoriesFromSettings(
				workspacePath,
				settings,
			),
			workspacePath,
		)
		const nextPinned = filterPinsWithEntries(
			pinsFromSettings,
			entries,
			workspacePath,
		)
		const pinsChanged = !areStringArraysEqual(pinsFromSettings, nextPinned)
		const expandedFromSettings =
			ctx.deps.settingsRepository.getExpandedDirectoriesFromSettings(
				workspacePath,
				settings,
			)
		const syncedExpandedDirectories = syncExpandedDirectoriesWithEntries(
			expandedFromSettings,
			entries,
		)

		ctx.get().updateEntries(entries)
		ctx.set({
			isTreeLoading: false,
			expandedDirectories: syncedExpandedDirectories,
			pinnedDirectories: nextPinned,
		})

		if (pinsChanged) {
			await ctx.deps.settingsRepository.persistPinnedDirectories(
				workspacePath,
				nextPinned,
			)
		}

		const expandedChanged = !areStringArraysEqual(
			expandedFromSettings,
			syncedExpandedDirectories,
		)

		if (expandedChanged) {
			await ctx.deps.settingsRepository.persistExpandedDirectories(
				workspacePath,
				syncedExpandedDirectories,
			)
		}

		if (options?.restoreLastOpenedNote) {
			await restoreLastOpenedNoteFromSettings(ctx, workspacePath, settings)
		}
	} catch (error) {
		if (ctx.get().workspacePath === workspacePath) {
			ctx.set({ isTreeLoading: false })
		}
		throw error
	}
}

export const createWorkspaceLifecycleActions = (
	ctx: WorkspaceActionContext,
): Pick<
	WorkspaceSlice,
	"initializeWorkspace" | "setWorkspace" | "openFolderPicker" | "clearWorkspace"
> => ({
	initializeWorkspace: async () => {
		try {
			const recentWorkspacePaths =
				ctx.deps.historyRepository.readWorkspaceHistory()
			const validationResults = await Promise.all(
				recentWorkspacePaths.map((path) =>
					ctx.deps.fileSystemRepository.isExistingDirectory(path),
				),
			)
			const nextRecentWorkspacePaths = recentWorkspacePaths.filter(
				(_, index) => validationResults[index],
			)

			if (
				!areStringArraysEqual(recentWorkspacePaths, nextRecentWorkspacePaths)
			) {
				ctx.deps.historyRepository.writeWorkspaceHistory(
					nextRecentWorkspacePaths,
				)
			}

			const workspacePath = nextRecentWorkspacePaths[0] ?? null
			const unwatchFn = resolveUnwatchFnForWorkspaceTransition(
				ctx,
				workspacePath,
			)

			ctx.set(
				buildWorkspaceState({
					workspacePath,
					recentWorkspacePaths: nextRecentWorkspacePaths,
					isTreeLoading: Boolean(workspacePath),
					unwatchFn,
				}),
			)
			ctx.ports.collection.resetCollectionPath()

			if (workspacePath) {
				await ctx.ports.gitSync.initGitSync(workspacePath)
				await bootstrapWorkspace(ctx, workspacePath, {
					restoreLastOpenedNote: true,
				})
			} else {
				ctx.set({ isMigrationsComplete: true })
			}
		} catch (error) {
			console.error("Failed to initialize workspace:", error)
			ctx.set(
				buildWorkspaceState({
					unwatchFn: resolveUnwatchFnForWorkspaceTransition(ctx, null),
				}),
			)
			ctx.ports.collection.resetCollectionPath()
		}
	},

	setWorkspace: async (path: string) => {
		try {
			if (!(await ctx.deps.fileSystemRepository.isExistingDirectory(path))) {
				const updatedHistory =
					ctx.deps.historyRepository.removeFromWorkspaceHistory(path)
				ctx.set({ recentWorkspacePaths: updatedHistory })
				ctx.deps.toast.error?.("Folder does not exist.", {
					description: path,
					position: "bottom-left",
				})
				return
			}

			const { tab } = ctx.get()

			if (tab) {
				ctx.ports.tab.closeTab(tab.path)
			}

			ctx.ports.tab.clearHistory()

			const recentWorkspacePaths = ctx.get().recentWorkspacePaths

			const updatedHistory = [
				path,
				...recentWorkspacePaths.filter((entry) => entry !== path),
			].slice(0, MAX_HISTORY_LENGTH)

			ctx.deps.historyRepository.writeWorkspaceHistory(updatedHistory)
			const unwatchFn = resolveUnwatchFnForWorkspaceTransition(ctx, path)

			ctx.set(
				buildWorkspaceState({
					workspacePath: path,
					recentWorkspacePaths: updatedHistory,
					isTreeLoading: true,
					unwatchFn,
				}),
			)
			ctx.ports.collection.resetCollectionPath()

			await ctx.ports.gitSync.initGitSync(path)

			await bootstrapWorkspace(ctx, path)
		} catch (error) {
			console.error("Failed to set workspace:", error)
		}
	},

	openFolderPicker: async () => {
		const path = await ctx.deps.openDialog({
			multiple: false,
			directory: true,
			title: "Select a folder",
		})

		if (path) {
			await ctx.get().setWorkspace(path)
		}
	},

	clearWorkspace: async () => {
		const { tab, workspacePath } = ctx.get()

		if (!workspacePath) {
			return
		}

		await ctx.deps.fileSystemRepository.moveToTrash(workspacePath)

		if (tab) {
			ctx.ports.tab.closeTab(tab.path)
			ctx.ports.tab.clearHistory()
		}

		const recentWorkspacePaths = ctx.get().recentWorkspacePaths
		const updatedHistory = recentWorkspacePaths.filter(
			(entryPath) => entryPath !== workspacePath,
		)

		ctx.deps.historyRepository.writeWorkspaceHistory(updatedHistory)
		const unwatchFn = resolveUnwatchFnForWorkspaceTransition(ctx, null)

		ctx.set(
			buildWorkspaceState({
				recentWorkspacePaths: updatedHistory,
				isMigrationsComplete: true,
				unwatchFn,
			}),
		)
		ctx.ports.collection.resetCollectionPath()
	},
})
