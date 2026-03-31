import { resolve } from "pathe"
import { isPathEqualOrDescendant } from "@/utils/path-utils"
import type { WorkspaceActionContext } from "../workspace-action-context"
import { buildWorkspaceState, type WorkspaceState } from "../workspace-state"

export type WorkspaceLifecycleActions = {
	initializeWorkspace: () => Promise<void>
	setWorkspace: (path: string) => Promise<void>
	removeWorkspaceFromHistory: (path: string) => Promise<void>
	openFolderPicker: () => Promise<void>
	clearWorkspace: () => Promise<void>
}

const MAX_RESTORED_LAST_OPENED_FILE_PATHS = 5

type ResetWorkspaceStateOptions = {
	workspacePath?: string | null
	recentWorkspacePaths?: string[]
	isTreeLoading?: boolean
	isMigrationsComplete?: boolean
}

const resolveUnwatchFnForWorkspaceTransition = (
	ctx: WorkspaceActionContext,
	nextWorkspacePath: string | null,
): WorkspaceState["unwatchFn"] => {
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

const resetWorkspaceState = (
	ctx: WorkspaceActionContext,
	options: ResetWorkspaceStateOptions = {},
) => {
	const workspacePath = options.workspacePath ?? null

	ctx.ports.indexing.resetIndexingState()
	ctx.set(
		buildWorkspaceState({
			workspacePath,
			recentWorkspacePaths: options.recentWorkspacePaths ?? [],
			isTreeLoading: options.isTreeLoading ?? Boolean(workspacePath),
			isMigrationsComplete: options.isMigrationsComplete ?? false,
			unwatchFn: resolveUnwatchFnForWorkspaceTransition(ctx, workspacePath),
		}),
	)
	ctx.ports.collection.resetCollectionPath()
}

const closeWorkspaceTabs = (
	ctx: WorkspaceActionContext,
	options?: { clearHistoryWhenNoActiveTab?: boolean },
) => {
	const activeTabPath = ctx.ports.tab.getActiveTabPath()

	if (activeTabPath) {
		ctx.ports.tab.closeTab(activeTabPath)
	}

	if (activeTabPath || options?.clearHistoryWhenNoActiveTab) {
		ctx.ports.tab.clearHistory()
	}
}

const restoreLastOpenedFileHistoryFromSettings = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	settings: { lastOpenedFilePaths?: string[] },
) => {
	const lastOpenedFilePaths = Array.isArray(settings.lastOpenedFilePaths)
		? settings.lastOpenedFilePaths
				.filter((path): path is string => typeof path === "string")
				.slice(-MAX_RESTORED_LAST_OPENED_FILE_PATHS)
		: []
	if (lastOpenedFilePaths.length === 0) {
		return
	}

	try {
		const restorablePaths: string[] = []

		for (const relativePath of lastOpenedFilePaths) {
			if (ctx.get().workspacePath !== workspacePath) {
				return
			}

			const absolutePath = resolve(workspacePath, relativePath)
			if (
				!isPathEqualOrDescendant(absolutePath, workspacePath) ||
				!(await ctx.deps.fileSystemRepository.exists(absolutePath))
			) {
				continue
			}

			restorablePaths.push(absolutePath)
		}

		if (restorablePaths.length === 0) {
			return
		}

		if (ctx.get().workspacePath !== workspacePath) {
			return
		}

		const hydrated = await ctx.ports.tab.hydrateFromOpenedFiles(restorablePaths)
		if (!hydrated) {
			console.debug("Failed to hydrate opened file history")
		}
	} catch (error) {
		console.debug("Failed to restore opened file history:", error)
	}
}

const bootstrapWorkspace = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	options?: { restoreLastOpenedFiles?: boolean },
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
			ctx.get().readWorkspaceEntriesFromPath(workspacePath),
		])

		if (ctx.get().workspacePath !== workspacePath) {
			return
		}

		const pinnedFromSettings =
			ctx.deps.settingsRepository.getPinnedDirectoriesFromSettings(
				workspacePath,
				settings,
			)
		const expandedFromSettings =
			ctx.deps.settingsRepository.getExpandedDirectoriesFromSettings(
				workspacePath,
				settings,
			)

		await ctx.get().syncDirectoryUiStateWithEntries({
			workspacePath,
			nextEntries: entries,
			options: {
				previousExpandedDirectories: expandedFromSettings,
				previousPinnedDirectories: pinnedFromSettings,
			},
		})
		ctx.set({ isTreeLoading: false })
		void ctx.ports.indexing.getIndexingConfig(workspacePath).catch((error) => {
			console.error("Failed to preload indexing config:", error)
		})

		if (options?.restoreLastOpenedFiles) {
			await restoreLastOpenedFileHistoryFromSettings(
				ctx,
				workspacePath,
				settings,
			)
		}
	} catch (error) {
		if (ctx.get().workspacePath === workspacePath) {
			ctx.set({ isTreeLoading: false })
		}
		throw error
	}
}

const loadWorkspace = async (
	ctx: WorkspaceActionContext,
	workspacePath: string | null,
	recentWorkspacePaths: string[],
	options?: { restoreLastOpenedFiles?: boolean },
) => {
	resetWorkspaceState(ctx, {
		workspacePath,
		recentWorkspacePaths,
	})

	if (!workspacePath) {
		ctx.set({ isMigrationsComplete: true })
		return
	}

	await ctx.ports.gitSync.initGitSync(workspacePath)
	await bootstrapWorkspace(ctx, workspacePath, options)
}

export const createLifecycleActions = (
	ctx: WorkspaceActionContext,
): WorkspaceLifecycleActions => ({
	initializeWorkspace: async () => {
		try {
			const recentWorkspacePaths =
				await ctx.deps.historyRepository.listWorkspacePaths()
			const validationResults = await Promise.all(
				recentWorkspacePaths.map((path) =>
					ctx.deps.fileSystemRepository.isExistingDirectory(path),
				),
			)
			const missingWorkspacePaths = recentWorkspacePaths.filter(
				(_, index) => !validationResults[index],
			)
			const nextRecentWorkspacePaths = recentWorkspacePaths.filter(
				(_, index) => validationResults[index],
			)

			for (const missingPath of missingWorkspacePaths) {
				try {
					await ctx.deps.historyRepository.removeWorkspace(missingPath)
				} catch (error) {
					console.error("Failed to remove missing workspace from vault:", error)
				}
			}

			const workspacePath = nextRecentWorkspacePaths[0] ?? null
			await loadWorkspace(ctx, workspacePath, nextRecentWorkspacePaths, {
				restoreLastOpenedFiles: true,
			})
		} catch (error) {
			console.error("Failed to initialize workspace:", error)
			resetWorkspaceState(ctx)
		}
	},

	setWorkspace: async (path: string) => {
		try {
			if (!(await ctx.deps.fileSystemRepository.isExistingDirectory(path))) {
				await ctx.deps.historyRepository.removeWorkspace(path)
				const updatedHistory =
					await ctx.deps.historyRepository.listWorkspacePaths()
				ctx.set({ recentWorkspacePaths: updatedHistory })
				ctx.deps.toast.error?.("Folder does not exist.", {
					description: path,
					position: "bottom-left",
				})
				return
			}

			closeWorkspaceTabs(ctx, { clearHistoryWhenNoActiveTab: true })

			await ctx.deps.historyRepository.touchWorkspace(path)
			const updatedHistory =
				await ctx.deps.historyRepository.listWorkspacePaths()
			await loadWorkspace(ctx, path, updatedHistory)
		} catch (error) {
			console.error("Failed to set workspace:", error)
		}
	},

	removeWorkspaceFromHistory: async (path: string) => {
		try {
			await ctx.deps.historyRepository.removeWorkspace(path)
			const updatedHistory =
				await ctx.deps.historyRepository.listWorkspacePaths()
			ctx.set({ recentWorkspacePaths: updatedHistory })
		} catch (error) {
			console.error("Failed to remove workspace from history:", error)
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
		const { workspacePath } = ctx.get()

		if (!workspacePath) {
			return
		}

		await ctx.deps.fileSystemRepository.moveToTrash(workspacePath)
		closeWorkspaceTabs(ctx)

		await ctx.deps.historyRepository.removeWorkspace(workspacePath)
		const updatedHistory = await ctx.deps.historyRepository.listWorkspacePaths()
		resetWorkspaceState(ctx, {
			recentWorkspacePaths: updatedHistory,
			isMigrationsComplete: true,
		})
	},
})
