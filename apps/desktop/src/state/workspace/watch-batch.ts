import {
	getFileNameFromPath,
	hasHiddenEntryInPaths,
	isPathEqualOrDescendant,
	normalizePathSeparators,
} from "@mdit/utils/path-utils"
import { dirname, normalize, resolve } from "pathe"
import type { DiskDocument } from "../documents/types"
import type { WorkspaceEntry } from "./types"
import type {
	VaultWatchBatchPayload,
	VaultWatchOp,
	WorkspaceWatchDependencies,
} from "./watch-types"

const isVisible = (path: string) => !hasHiddenEntryInPaths([path])

const collectVisiblePaths = (ops: VaultWatchOp[]) =>
	ops
		.flatMap((op) => {
			if (op.type === "move") {
				return [op.fromRel, op.toRel]
			}
			return op.type === "pathState" ? [op.relPath] : []
		})
		.filter(isVisible)

const collapseDirectoryPaths = (directories: ReadonlySet<string>) => {
	const collapsed = new Set<string>()
	for (const path of [...directories].sort(
		(left, right) => left.length - right.length,
	)) {
		let parent = dirname(path)
		while (parent !== dirname(parent) && !collapsed.has(parent)) {
			parent = dirname(parent)
		}
		if (!collapsed.has(parent)) {
			collapsed.add(path)
		}
	}
	return [...collapsed]
}

export const applyWorkspaceWatchBatch = async (
	deps: WorkspaceWatchDependencies,
	{ workspacePath, batch }: VaultWatchBatchPayload,
	options: { isCurrent: () => boolean; requiresFullRefresh: boolean },
): Promise<void> => {
	const { isCurrent } = options
	const { tree, documents, fileSystem } = deps
	const root = normalizePathSeparators(workspacePath)
	const toAbsolutePath = (relativePath: string) => {
		const path = normalizePathSeparators(resolve(workspacePath, relativePath))
		return isPathEqualOrDescendant(path, root) ? path : null
	}
	const hasDirectory = (path: string) =>
		path === root || tree.getEntryByPath(path)?.isDirectory === true

	const hasFullRescan = batch.ops.some((op) => op.type === "fullRescan")
	let requiresFullRefresh = options.requiresFullRefresh || hasFullRescan
	const directoryPaths = new Set<string>()
	const notePaths = new Set<string>()
	const rescanDirectory = (path: string) => {
		if (isPathEqualOrDescendant(path, root)) {
			directoryPaths.add(path)
		} else {
			requiresFullRefresh = true
		}
	}

	const visiblePaths = hasFullRescan ? [] : collectVisiblePaths(batch.ops)
	const externalPaths = new Set(
		(visiblePaths.length
			? deps.originJournal.resolve({ workspacePath, relPaths: visiblePaths })
					.externalRelPaths
			: []
		).map(normalizePathSeparators),
	)
	const isExternal = (path: string) =>
		externalPaths.has(normalizePathSeparators(path))

	const applyMove = async (op: Extract<VaultWatchOp, { type: "move" }>) => {
		const from = toAbsolutePath(op.fromRel)
		const to = toAbsolutePath(op.toRel)
		if (!from || !to) {
			requiresFullRefresh = true
			return
		}

		const visibleFrom = isVisible(op.fromRel)
		const visibleTo = isVisible(op.toRel)
		if (visibleTo) {
			// An atomic write may arrive as a move from a hidden temporary file.
			notePaths.add(to)
		}
		if (!isExternal(op.fromRel) && !isExternal(op.toRel)) {
			return
		}
		const fromParent = dirname(from)
		const toParent = dirname(to)
		const isDirectory = op.entryKind === "directory"
		// Reconcile replacements from disk so two paths never collapse into
		// duplicate tree entries or document sessions.
		const replacesTarget =
			from !== to &&
			(tree.getEntryByPath(to) !== null ||
				documents
					.getOpenDocumentSnapshots()
					.some(({ path }) => isPathEqualOrDescendant(path, to)))
		if (
			visibleFrom &&
			visibleTo &&
			!replacesTarget &&
			tree.getEntryByPath(from) &&
			hasDirectory(toParent)
		) {
			try {
				if ((await fileSystem.exists(to)) && isCurrent()) {
					if (fromParent === toParent) {
						await tree.entryRenamed({
							oldPath: from,
							newPath: to,
							isDirectory,
							newName: getFileNameFromPath(to),
						})
					} else {
						await tree.entryMoved({
							sourcePath: from,
							destinationDirPath: toParent,
							newPath: to,
							isDirectory,
						})
					}
					return
				}
			} catch {
				// Fall back to reading both affected directories.
			}
		}
		if (visibleFrom) {
			rescanDirectory(fromParent)
		}
		if (visibleTo) {
			rescanDirectory(toParent)
		}
	}

	const applyPathState = async (
		op: Extract<VaultWatchOp, { type: "pathState" }>,
	) => {
		if (!isVisible(op.relPath)) {
			return
		}
		const path = toAbsolutePath(op.relPath)
		if (!path) {
			requiresFullRefresh = true
			return
		}

		const external = isExternal(op.relPath)
		if (op.after === "file" || (op.after === "missing" && !external)) {
			// The mutation journal filters tree echoes. For open notes, check the
			// actual revision even when another writer touched a recent local path.
			notePaths.add(path)
		}
		if (!external) {
			return
		}

		const parentPath = dirname(path)
		try {
			if (op.after === "missing") {
				const affectsOpenDocument = documents
					.getOpenDocumentSnapshots()
					.some((document) => isPathEqualOrDescendant(document.path, path))
				if (affectsOpenDocument && (await fileSystem.exists(path))) {
					rescanDirectory(parentPath)
				} else if (isCurrent()) {
					await tree.entriesDeleted({ paths: [path], preserveUnsaved: true })
				}
				return
			}

			if (
				op.before === "missing" &&
				(op.after === "file" || op.after === "directory")
			) {
				if (!hasDirectory(parentPath)) {
					rescanDirectory(parentPath)
					return
				}
				if (tree.getEntryByPath(path)) {
					return
				}

				const isDirectory = op.after === "directory"
				const stat = await fileSystem.stat(path)
				if (stat.isDirectory !== isDirectory) {
					rescanDirectory(parentPath)
					return
				}
				const entry: WorkspaceEntry = {
					path,
					name: getFileNameFromPath(path),
					isDirectory,
					children: isDirectory
						? await tree.readWorkspaceEntriesFromPath(path)
						: undefined,
					createdAt:
						stat.birthtime == null ? undefined : new Date(stat.birthtime),
					modifiedAt: stat.mtime == null ? undefined : new Date(stat.mtime),
				}
				if (isCurrent()) {
					await tree.entryCreated({ parentPath, entry })
				}
				return
			}

			if (op.before === op.after && op.after === "directory") {
				rescanDirectory(path)
			} else if (
				op.before === op.after &&
				op.after === "file" &&
				tree.getEntryByPath(path)
			) {
				await tree.updateEntryModifiedDate(path, isCurrent)
			} else if (op.before === "missing" || op.before === op.after) {
				rescanDirectory(parentPath)
			} else {
				requiresFullRefresh = true
			}
		} catch {
			rescanDirectory(parentPath)
		}
	}

	if (!hasFullRescan) {
		for (const op of batch.ops) {
			if (!isCurrent()) {
				return
			}
			switch (op.type) {
				case "move":
					await applyMove(op)
					break
				case "pathState":
					await applyPathState(op)
					break
				case "scanTree":
					if (isVisible(op.relPrefix)) {
						const path = toAbsolutePath(op.relPrefix)
						if (path) {
							rescanDirectory(path)
						} else {
							requiresFullRefresh = true
						}
					}
					break
			}
		}
	}

	if (!isCurrent()) {
		return
	}
	const directories = collapseDirectoryPaths(directoryPaths)
	if (!requiresFullRefresh && directories.length) {
		try {
			await tree.reconcileDirectoryEntries(directories, isCurrent)
		} catch {
			requiresFullRefresh = true
		}
	}
	if (requiresFullRefresh && isCurrent()) {
		await tree.refreshWorkspaceEntries(isCurrent)
	}
	await refreshOpenDocuments(
		deps,
		requiresFullRefresh ? [root] : [...directories, ...notePaths],
		isCurrent,
	)
}

const isAffected = (path: string, affectedPaths: ReadonlySet<string>) => {
	let candidate = normalizePathSeparators(normalize(path))
	while (!affectedPaths.has(candidate)) {
		const parent = normalizePathSeparators(dirname(candidate))
		if (parent === candidate) {
			return false
		}
		candidate = parent
	}
	return true
}

const refreshOpenDocuments = async (
	deps: WorkspaceWatchDependencies,
	paths: string[],
	isCurrent: () => boolean,
): Promise<void> => {
	if (!paths.length || !isCurrent()) {
		return
	}

	const { documents, fileSystem } = deps
	const affectedPaths = new Set(paths)
	const reportError =
		deps.onError ??
		((error) => console.warn("Failed to refresh open note:", error))
	for (const { documentId, path } of documents.getOpenDocumentSnapshots()) {
		if (!isCurrent()) {
			return
		}
		if (!isAffected(path, affectedPaths)) {
			continue
		}

		const document = documents.getDocumentById(documentId)
		if (!document || document.path !== path) {
			continue
		}
		const isCurrentDocument = () => {
			const current = documents.getDocumentById(documentId)
			return (
				isCurrent() &&
				current?.path === document.path &&
				current.diskRevision === document.diskRevision &&
				current.sessionEpoch === document.sessionEpoch
			)
		}

		let disk: DiskDocument | null
		try {
			disk = await deps.readDocument(path)
		} catch (error) {
			// A path replaced by a directory no longer contains the open note.
			const isDirectory = await fileSystem
				.isExistingDirectory(path)
				.catch(() => false)
			if (!isDirectory) {
				if (isCurrentDocument()) {
					reportError(error)
				}
				continue
			}
			disk = null
		}

		if (!isCurrentDocument()) {
			continue
		}
		if (disk) {
			await documents.refreshTabFromExternalContent(path, disk.content, {
				preserveSelection: true,
				revision: disk.revision,
				isCurrent: isCurrentDocument,
			})
		} else {
			documents.removePathsFromHistory([path], { preserveUnsaved: true })
		}
	}
}
