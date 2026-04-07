import {
	getFileNameFromPath,
	isPathEqualOrDescendant,
	normalizePathSeparators,
} from "@mdit/utils/path-utils"
import { dirname, resolve } from "pathe"
import { findEntryByPath, findParentDirectory } from "../tree/domain/entry-tree"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceEntry } from "../workspace-state"
import { getOpenTabSnapshotsForWorkspacePolicy } from "../workspace-tab-policy"
import { collapseDirectoryPaths } from "./tree-patch"
import type { VaultWatchOp } from "./types"

export type ApplyWatchBatchChangesInput = {
	workspacePath: string
	ops: VaultWatchOp[]
	externalRelPaths: string[]
}

export type ApplyWatchBatchChangesResult = {
	fallbackDirectoryPaths: string[]
	requiresFullRefresh: boolean
}

const isExternalChange = (
	op: VaultWatchOp,
	externalRelPathSet: ReadonlySet<string>,
): boolean => {
	if (op.type === "move") {
		return (
			externalRelPathSet.has(normalizePathSeparators(op.fromRel)) ||
			externalRelPathSet.has(normalizePathSeparators(op.toRel))
		)
	}

	if (op.type === "pathState") {
		return externalRelPathSet.has(normalizePathSeparators(op.relPath))
	}

	return false
}

const toAbsolutePath = (
	workspacePath: string,
	normalizedWorkspacePath: string,
	relPath: string,
): string | null => {
	const absolutePath = normalizePathSeparators(resolve(workspacePath, relPath))
	return isPathEqualOrDescendant(absolutePath, normalizedWorkspacePath)
		? absolutePath
		: null
}

const addFallbackDirectoryPath = (
	fallbackDirectoryPaths: Set<string>,
	normalizedWorkspacePath: string,
	directoryPath: string,
): boolean => {
	const normalizedDirectoryPath = normalizePathSeparators(directoryPath)
	if (
		!isPathEqualOrDescendant(normalizedDirectoryPath, normalizedWorkspacePath)
	) {
		return false
	}

	fallbackDirectoryPaths.add(normalizedDirectoryPath)
	return true
}

const addFallbackParentDirectoryPath = (
	fallbackDirectoryPaths: Set<string>,
	normalizedWorkspacePath: string,
	path: string,
): boolean =>
	addFallbackDirectoryPath(
		fallbackDirectoryPaths,
		normalizedWorkspacePath,
		dirname(path),
	)

const buildCreatedEntrySnapshot = async (
	ctx: WorkspaceActionContext,
	path: string,
	isDirectory: boolean,
): Promise<WorkspaceEntry> => {
	const metadata = await ctx.deps.fileSystemRepository.stat(path)
	const createdAt = metadata.birthtime
		? new Date(metadata.birthtime)
		: undefined
	const modifiedAt = metadata.mtime ? new Date(metadata.mtime) : undefined

	if (isDirectory) {
		return {
			path,
			name: getFileNameFromPath(path),
			isDirectory: true,
			children: await ctx.get().readWorkspaceEntriesFromPath(path),
			createdAt,
			modifiedAt,
		}
	}

	return {
		path,
		name: getFileNameFromPath(path),
		isDirectory: false,
		children: undefined,
		createdAt,
		modifiedAt,
	}
}

const hasDirectoryInEntries = (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	path: string,
): boolean => {
	if (path === workspacePath) {
		return true
	}

	return Boolean(findParentDirectory(ctx.get().entries, path))
}

const addBothParentFallbacks = (
	fallbackDirectoryPaths: Set<string>,
	normalizedWorkspacePath: string,
	fromPath: string,
	toPath: string,
): boolean => {
	const addedFrom = addFallbackParentDirectoryPath(
		fallbackDirectoryPaths,
		normalizedWorkspacePath,
		fromPath,
	)
	const addedTo = addFallbackParentDirectoryPath(
		fallbackDirectoryPaths,
		normalizedWorkspacePath,
		toPath,
	)

	return addedFrom || addedTo
}

export const applyWatchBatchChanges = async (
	ctx: WorkspaceActionContext,
	input: ApplyWatchBatchChangesInput,
): Promise<ApplyWatchBatchChangesResult> => {
	const normalizedWorkspacePath = normalizePathSeparators(input.workspacePath)
	const externalRelPathSet = new Set(
		input.externalRelPaths.map((path) => normalizePathSeparators(path)),
	)
	const fallbackDirectoryPaths = new Set<string>()
	let requiresFullRefresh = false
	let openTabPathSet: Set<string> | null = null

	const readOpenTabPathSet = (): Set<string> => {
		if (openTabPathSet === null) {
			openTabPathSet = new Set(
				getOpenTabSnapshotsForWorkspacePolicy(ctx).map((tab) => tab.path),
			)
		}

		return openTabPathSet
	}

	const invalidateOpenTabPathSet = () => {
		openTabPathSet = null
	}

	for (const op of input.ops) {
		if (!isExternalChange(op, externalRelPathSet)) {
			continue
		}

		if (op.type === "move") {
			const fromPath = toAbsolutePath(
				input.workspacePath,
				normalizedWorkspacePath,
				op.fromRel,
			)
			const toPath = toAbsolutePath(
				input.workspacePath,
				normalizedWorkspacePath,
				op.toRel,
			)
			if (!fromPath || !toPath) {
				requiresFullRefresh = true
				continue
			}

			const sourceEntry = findEntryByPath(ctx.get().entries, fromPath)
			if (!sourceEntry) {
				if (
					!addBothParentFallbacks(
						fallbackDirectoryPaths,
						normalizedWorkspacePath,
						fromPath,
						toPath,
					)
				) {
					requiresFullRefresh = true
				}
				continue
			}

			const fromParentPath = normalizePathSeparators(dirname(fromPath))
			const toParentPath = normalizePathSeparators(dirname(toPath))
			const isDirectory = op.entryKind === "directory"

			if (fromParentPath === toParentPath) {
				try {
					await ctx.get().entryRenamed({
						oldPath: fromPath,
						newPath: toPath,
						isDirectory,
						newName: getFileNameFromPath(toPath),
					})
					invalidateOpenTabPathSet()
				} catch {
					if (
						!addBothParentFallbacks(
							fallbackDirectoryPaths,
							normalizedWorkspacePath,
							fromPath,
							toPath,
						)
					) {
						requiresFullRefresh = true
					}
				}
				continue
			}

			if (!hasDirectoryInEntries(ctx, normalizedWorkspacePath, toParentPath)) {
				if (
					!addBothParentFallbacks(
						fallbackDirectoryPaths,
						normalizedWorkspacePath,
						fromPath,
						toPath,
					)
				) {
					requiresFullRefresh = true
				}
				continue
			}

			try {
				await ctx.get().entryMoved({
					sourcePath: fromPath,
					destinationDirPath: toParentPath,
					newPath: toPath,
					isDirectory,
				})
				invalidateOpenTabPathSet()
			} catch {
				if (
					!addBothParentFallbacks(
						fallbackDirectoryPaths,
						normalizedWorkspacePath,
						fromPath,
						toPath,
					)
				) {
					requiresFullRefresh = true
				}
			}
			continue
		}

		if (op.type !== "pathState") {
			continue
		}

		const absolutePath = toAbsolutePath(
			input.workspacePath,
			normalizedWorkspacePath,
			op.relPath,
		)
		if (!absolutePath) {
			requiresFullRefresh = true
			continue
		}

		if (op.after === "missing") {
			try {
				await ctx.get().entriesDeleted({ paths: [absolutePath] })
				invalidateOpenTabPathSet()
			} catch {
				if (
					!addFallbackParentDirectoryPath(
						fallbackDirectoryPaths,
						normalizedWorkspacePath,
						absolutePath,
					)
				) {
					requiresFullRefresh = true
				}
			}
			continue
		}

		if (op.before === "missing") {
			const parentPath = normalizePathSeparators(dirname(absolutePath))
			if (op.after === "unknown") {
				if (
					!addFallbackDirectoryPath(
						fallbackDirectoryPaths,
						normalizedWorkspacePath,
						parentPath,
					)
				) {
					requiresFullRefresh = true
				}
				continue
			}

			if (op.after !== "file" && op.after !== "directory") {
				requiresFullRefresh = true
				continue
			}

			if (!hasDirectoryInEntries(ctx, normalizedWorkspacePath, parentPath)) {
				if (
					!addFallbackDirectoryPath(
						fallbackDirectoryPaths,
						normalizedWorkspacePath,
						parentPath,
					)
				) {
					requiresFullRefresh = true
				}
				continue
			}

			if (findEntryByPath(ctx.get().entries, absolutePath)) {
				continue
			}

			try {
				const entry = await buildCreatedEntrySnapshot(
					ctx,
					absolutePath,
					op.after === "directory",
				)
				await ctx.get().entryCreated({
					parentPath,
					entry,
				})
			} catch {
				if (
					!addFallbackDirectoryPath(
						fallbackDirectoryPaths,
						normalizedWorkspacePath,
						parentPath,
					)
				) {
					requiresFullRefresh = true
				}
			}
			continue
		}

		if (op.before !== op.after) {
			requiresFullRefresh = true
			continue
		}

		if (op.after === "directory") {
			if (
				!addFallbackDirectoryPath(
					fallbackDirectoryPaths,
					normalizedWorkspacePath,
					absolutePath,
				)
			) {
				requiresFullRefresh = true
			}
			continue
		}

		if (op.after !== "file") {
			requiresFullRefresh = true
			continue
		}

		if (!findEntryByPath(ctx.get().entries, absolutePath)) {
			if (
				!addFallbackParentDirectoryPath(
					fallbackDirectoryPaths,
					normalizedWorkspacePath,
					absolutePath,
				)
			) {
				requiresFullRefresh = true
			}
			continue
		}

		const isOpenTabPath = readOpenTabPathSet().has(absolutePath)
		if (isOpenTabPath && absolutePath.endsWith(".md")) {
			try {
				const content =
					await ctx.deps.fileSystemRepository.readTextFile(absolutePath)
				ctx.ports.tab.refreshTabFromExternalContent(absolutePath, content, {
					preserveSelection: true,
				})
			} catch (error) {
				console.warn(
					"Failed to refresh active tab from external file change:",
					error,
				)
			}
		}

		try {
			await ctx.get().updateEntryModifiedDate(absolutePath)
		} catch {
			if (
				!addFallbackParentDirectoryPath(
					fallbackDirectoryPaths,
					normalizedWorkspacePath,
					absolutePath,
				)
			) {
				requiresFullRefresh = true
			}
		}
	}

	return {
		fallbackDirectoryPaths: collapseDirectoryPaths(
			normalizedWorkspacePath,
			Array.from(fallbackDirectoryPaths),
		),
		requiresFullRefresh,
	}
}
