import { normalizePathSeparators } from "@/utils/path-utils"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceEntry } from "../workspace-state"

const replaceMultipleDirectoryChildren = (
	entries: WorkspaceEntry[],
	workspacePath: string,
	directoryChildrenByPath: ReadonlyMap<string, WorkspaceEntry[]>,
): WorkspaceEntry[] => {
	const normalizedWorkspacePath = normalizePathSeparators(workspacePath)
	if (directoryChildrenByPath.size === 0) {
		return entries
	}

	const normalizedDirectoryChildrenByPath = new Map<string, WorkspaceEntry[]>()
	for (const [directoryPath, children] of directoryChildrenByPath) {
		normalizedDirectoryChildrenByPath.set(
			normalizePathSeparators(directoryPath),
			children,
		)
	}

	if (normalizedDirectoryChildrenByPath.has(normalizedWorkspacePath)) {
		return normalizedDirectoryChildrenByPath.get(normalizedWorkspacePath) ?? []
	}

	const replaceInTree = (list: WorkspaceEntry[]): WorkspaceEntry[] => {
		let changed = false

		const updated = list.map((entry) => {
			if (!entry.isDirectory || !entry.children) {
				return entry
			}

			const normalizedEntryPath = normalizePathSeparators(entry.path)
			if (normalizedDirectoryChildrenByPath.has(normalizedEntryPath)) {
				changed = true
				return {
					...entry,
					children:
						normalizedDirectoryChildrenByPath.get(normalizedEntryPath) ?? [],
				}
			}

			const updatedChildren = replaceInTree(entry.children)
			if (updatedChildren !== entry.children) {
				changed = true
				return {
					...entry,
					children: updatedChildren,
				}
			}

			return entry
		})

		return changed ? updated : list
	}

	return replaceInTree(entries)
}

export const replaceDirectoryChildren = (
	entries: WorkspaceEntry[],
	workspacePath: string,
	directoryPath: string,
	nextChildren: WorkspaceEntry[],
): WorkspaceEntry[] => {
	return replaceMultipleDirectoryChildren(
		entries,
		workspacePath,
		new Map([[directoryPath, nextChildren]]),
	)
}

export const refreshChangedWorkspaceDirectories = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	directoryPaths: string[],
) => {
	if (directoryPaths.length === 0) {
		return
	}

	const directorySnapshots = await Promise.all(
		directoryPaths.map(async (directoryPath) => ({
			directoryPath,
			children: await ctx.get().readWorkspaceEntriesFromPath(directoryPath),
		})),
	)

	if (ctx.get().workspacePath !== workspacePath) {
		return
	}

	const nextEntries = replaceMultipleDirectoryChildren(
		ctx.get().entries,
		workspacePath,
		new Map(
			directorySnapshots.map(({ directoryPath, children }) => [
				directoryPath,
				children,
			]),
		),
	)

	await ctx.get().syncDirectoryUiStateWithEntries({
		workspacePath,
		nextEntries,
	})
}

export const reconcileWorkspaceTreeFromFallback = async (
	ctx: WorkspaceActionContext,
	input: {
		workspacePath: string
		fallbackDirectoryPaths: string[]
		requiresFullRefresh: boolean
	},
) => {
	if (input.requiresFullRefresh) {
		await ctx.get().refreshWorkspaceEntries()
		return
	}

	if (input.fallbackDirectoryPaths.length === 0) {
		return
	}

	try {
		await refreshChangedWorkspaceDirectories(
			ctx,
			input.workspacePath,
			input.fallbackDirectoryPaths,
		)
	} catch (error) {
		console.warn("Failed to reconcile workspace tree from fallback:", error)
		await ctx.get().refreshWorkspaceEntries()
	}
}
