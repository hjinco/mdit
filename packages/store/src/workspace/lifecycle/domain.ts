import { isPathEqualOrDescendant } from "@mdit/utils/path-utils"
import { resolve } from "pathe"
import type { WorkspaceActionContext } from "../workspace-action-context"
import { buildWorkspaceState, type WorkspaceState } from "../workspace-state"
import {
	getActiveTabPathForWorkspacePolicy,
	getOpenTabSnapshotsForWorkspacePolicy,
} from "../workspace-tab-policy"

const MAX_RESTORED_LAST_OPENED_FILE_PATHS = 5

type ResetWorkspaceStateOptions = {
	workspacePath?: string | null
	recentWorkspacePaths?: string[]
	isTreeLoading?: boolean
	isMigrationsComplete?: boolean
}

export type LoadWorkspaceOptions = {
	restoreLastOpenedFiles?: boolean
	recentWorkspacePaths?: string[]
}

export const resolveUnwatchFnForWorkspaceTransition = (
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

export const resetWorkspaceState = (
	ctx: WorkspaceActionContext,
	options: ResetWorkspaceStateOptions = {},
) => {
	const workspacePath = options.workspacePath ?? null

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
	void ctx.runtime.events
		.emit({
			type: "workspace/reset",
			workspacePath,
		})
		.catch((error) => {
			console.error("Failed to emit workspace reset event:", error)
		})
}

export const closeWorkspaceTabs = (
	ctx: WorkspaceActionContext,
	options?: { clearHistoryWhenNoActiveTab?: boolean },
) => {
	const openTabSnapshots = getOpenTabSnapshotsForWorkspacePolicy(ctx)
	const activeTabPath = getActiveTabPathForWorkspacePolicy(ctx)

	if (activeTabPath || openTabSnapshots.length > 0) {
		ctx.ports.tab.closeAllTabs()
	}

	if (openTabSnapshots.length > 0 || options?.clearHistoryWhenNoActiveTab) {
		ctx.ports.tab.clearHistory()
	}
}

export const hasUnsavedWorkspaceTabs = (ctx: WorkspaceActionContext): boolean =>
	getOpenTabSnapshotsForWorkspacePolicy(ctx).some((tab) => !tab.isSaved)

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
		void ctx.runtime.events
			.emit({
				type: "workspace/loaded",
				workspacePath,
			})
			.catch((error) => {
				console.error("Failed to emit workspace loaded event:", error)
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

export const loadWorkspace = async (
	ctx: WorkspaceActionContext,
	workspacePath: string | null,
	options?: LoadWorkspaceOptions,
) => {
	resetWorkspaceState(ctx, {
		workspacePath,
		recentWorkspacePaths:
			options?.recentWorkspacePaths ?? ctx.get().recentWorkspacePaths,
	})

	if (!workspacePath) {
		ctx.set({ isMigrationsComplete: true })
		return
	}

	await bootstrapWorkspace(ctx, workspacePath, options)
}

export const syncRecentWorkspacePaths = async (
	ctx: WorkspaceActionContext,
): Promise<string[]> => {
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

	ctx.set({ recentWorkspacePaths: nextRecentWorkspacePaths })
	return nextRecentWorkspacePaths
}
