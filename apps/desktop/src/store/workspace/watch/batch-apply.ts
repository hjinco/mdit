import { dirname, resolve } from "pathe"
import {
	getFileNameFromPath,
	isPathEqualOrDescendant,
	normalizePathSeparators,
} from "@/utils/path-utils"
import { findEntryByPath, findParentDirectory } from "../tree/domain/entry-tree"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceEntry } from "../workspace-state"
import { collapseDirectoryPaths } from "./tree-patch"
import type { VaultWatchChange } from "./types"

export type ApplyWatchBatchChangesInput = {
	workspacePath: string
	changes: VaultWatchChange[]
	externalRelPaths: string[]
}

export type ApplyWatchBatchChangesResult = {
	fallbackDirectoryPaths: string[]
	requiresFullRefresh: boolean
}

const isExternalChange = (
	change: VaultWatchChange,
	externalRelPathSet: ReadonlySet<string>,
): boolean => {
	if (change.type === "moved") {
		return (
			externalRelPathSet.has(normalizePathSeparators(change.fromRel)) ||
			externalRelPathSet.has(normalizePathSeparators(change.toRel))
		)
	}

	return externalRelPathSet.has(normalizePathSeparators(change.relPath))
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

	for (const change of input.changes) {
		if (!isExternalChange(change, externalRelPathSet)) {
			continue
		}

		if (change.type === "moved") {
			const fromPath = toAbsolutePath(
				input.workspacePath,
				normalizedWorkspacePath,
				change.fromRel,
			)
			const toPath = toAbsolutePath(
				input.workspacePath,
				normalizedWorkspacePath,
				change.toRel,
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
			const isDirectory = change.entryKind === "directory"

			if (fromParentPath === toParentPath) {
				try {
					await ctx.get().entryRenamed({
						oldPath: fromPath,
						newPath: toPath,
						isDirectory,
						newName: getFileNameFromPath(toPath),
					})
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

		const absolutePath = toAbsolutePath(
			input.workspacePath,
			normalizedWorkspacePath,
			change.relPath,
		)
		if (!absolutePath) {
			requiresFullRefresh = true
			continue
		}

		if (change.type === "deleted") {
			try {
				await ctx.get().entriesDeleted({ paths: [absolutePath] })
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

		if (change.type === "modified") {
			if (change.entryKind === "directory") {
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
			continue
		}

		const parentPath = normalizePathSeparators(dirname(absolutePath))
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
				change.entryKind === "directory",
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
	}

	return {
		fallbackDirectoryPaths: collapseDirectoryPaths(
			normalizedWorkspacePath,
			Array.from(fallbackDirectoryPaths),
		),
		requiresFullRefresh,
	}
}
