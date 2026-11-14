import type { LocalMutationTarget } from "@mdit/local-fs-origin"
import {
	getFileNameFromPath,
	hasPathConflictWithLockedPaths,
	isPathEqualOrDescendant,
} from "@mdit/utils/path-utils"
import {
	getPortableEntryNameValidationError,
	sanitizePortableEntryName,
} from "@mdit/utils/portable-filename"
import { dirname, join } from "pathe"
import { claimUniqueFileName, generateUniqueFileName } from "./filesystem"
import type {
	FileSystemRepositoryLike,
	WorkspaceEntry,
	WorkspaceState,
} from "./types"
import type { WorkspaceWatchDependencies } from "./watch-types"

export type CreateNoteOptions = {
	initialName?: string
	initialContent?: string
	openTab?: boolean
}

export type RenameEntryOptions = {
	allowLockedSourcePath?: boolean
}

export type MoveEntryOptions = {
	onConflict?: "fail" | "auto-rename"
	allowLockedSourcePath?: boolean
	onMoved?: (newPath: string) => void
}

type WorkspaceTree = Omit<
	WorkspaceWatchDependencies["tree"],
	"entryCreated"
> & {
	entryCreated(input: {
		parentPath: string
		entry: WorkspaceEntry
		expandParent?: boolean
		expandNewDirectory?: boolean
	}): Promise<void>
}
type FileCommandPorts = {
	fileSystem: FileSystemRepositoryLike
	createDocument: (path: string, content: string) => Promise<boolean>
	getSnapshot: () => WorkspaceState
	isCurrentSession: (sessionId: number) => boolean
	tree: WorkspaceTree
	documents: Pick<
		WorkspaceWatchDependencies["documents"],
		"getOpenDocumentSnapshots" | "getDocumentById"
	> & {
		getActiveTabPath(): string | null
		openTab(
			path: string,
			skipHistory?: boolean,
			force?: boolean,
			options?: { initialSelection?: "title" },
		): Promise<void>
		flushDocumentsUnderPaths(paths: string[]): Promise<boolean>
		reserveDocumentRename(oldPath: string, newPath: string): () => void
	}
	registerLocalMutation: (targets: LocalMutationTarget[]) => void
	selectEntry: (path: string) => void
}

export function createWorkspaceFileCommands({
	fileSystem,
	createDocument,
	getSnapshot,
	isCurrentSession: isCurrent,
	tree,
	documents,
	registerLocalMutation,
	selectEntry,
}: FileCommandPorts) {
	const isLocked = (paths: string[], allowLockedSourcePath = false) =>
		hasPathConflictWithLockedPaths(
			paths,
			[...getSnapshot().aiLockedEntryPaths].filter(
				(path) => !allowLockedSourcePath || path !== paths[0],
			),
		)

	const resolveMutationPaths = async (paths: string[]) => {
		const openDocuments = new Map(
			documents
				.getOpenDocumentSnapshots()
				.map(({ documentId, path }) => [path, documentId]),
		)
		if (!(await documents.flushDocumentsUnderPaths(paths))) {
			return null
		}

		const resolved: string[] = []
		for (const path of paths) {
			const documentId = openDocuments.get(path)
			if (documentId === undefined) {
				resolved.push(path)
				continue
			}
			// A save that changed the title may have renamed the note.
			const document = documents.getDocumentById(documentId)
			if (!document) {
				return null
			}
			resolved.push(document.path)
		}
		return [...new Set(resolved)]
	}

	const registerTransfer = (
		sourcePath: string,
		targetPath: string,
		isDirectory: boolean,
	) => {
		const scope = isDirectory ? "subtree" : "exact"
		registerLocalMutation([
			{ path: sourcePath, scope },
			{ path: targetPath, scope },
		])
	}

	const createNote = async (
		directoryPath: string,
		options?: CreateNoteOptions,
	): Promise<string> => {
		const { workspacePath, sessionId } = getSnapshot()
		const baseName = sanitizePortableEntryName(
			options?.initialName ?? "Untitled",
		)
		if (!baseName) {
			throw new Error("Note name is empty after sanitization.")
		}
		const { fileName, fullPath } = await claimUniqueFileName(
			`${baseName}.md`,
			directoryPath,
			async (path) => {
				if (await fileSystem.exists(path)) {
					return false
				}
				if (!isCurrent(sessionId)) {
					throw new Error("Workspace changed before note creation.")
				}
				try {
					return await createDocument(path, options?.initialContent ?? "")
				} catch (error) {
					// A non-note entry can also have claimed the filename.
					if (await fileSystem.exists(path).catch(() => false)) {
						return false
					}
					throw error
				}
			},
			{ pattern: "space" },
		)
		if (!isCurrent(sessionId)) {
			return fullPath
		}

		registerLocalMutation([{ path: fullPath, scope: "exact" }])
		if (
			workspacePath &&
			isPathEqualOrDescendant(directoryPath, workspacePath)
		) {
			const now = new Date()
			await tree.entryCreated({
				parentPath: directoryPath,
				entry: {
					path: fullPath,
					name: fileName,
					isDirectory: false,
					createdAt: now,
					modifiedAt: now,
				},
			})
		}

		if (options?.openTab && isCurrent(sessionId)) {
			await documents.openTab(fullPath, false, false, {
				initialSelection: "title",
			})
			if (isCurrent(sessionId)) {
				selectEntry(fullPath)
			}
		}
		return fullPath
	}

	const createFolder = async (directoryPath: string, folderName: string) => {
		const { sessionId } = getSnapshot()
		const name = sanitizePortableEntryName(folderName)
		if (!name) {
			return null
		}

		try {
			const { fileName, fullPath } = await generateUniqueFileName(
				name,
				directoryPath,
				fileSystem.exists.bind(fileSystem),
				{ pattern: "space" },
			)
			if (!isCurrent(sessionId)) {
				return null
			}

			await fileSystem.mkdir(fullPath, { recursive: true })
			if (isCurrent(sessionId)) {
				registerLocalMutation([{ path: fullPath, scope: "exact" }])
				await tree.entryCreated({
					parentPath: directoryPath,
					entry: {
						path: fullPath,
						name: fileName,
						isDirectory: true,
						children: [],
					},
					expandParent: true,
					expandNewDirectory: true,
				})
				if (isCurrent(sessionId)) {
					selectEntry(fullPath)
				}
			}
			return fullPath
		} catch (error) {
			console.error("Failed to create folder:", error)
			return null
		}
	}

	const deleteEntries = async (paths: string[]) => {
		const { workspacePath, sessionId } = getSnapshot()
		if (!workspacePath || paths.length === 0 || isLocked(paths)) {
			return
		}
		const targets = await resolveMutationPaths(paths)
		if (
			!targets ||
			!isCurrent(sessionId) ||
			isLocked(targets) ||
			targets.some(
				(path) =>
					!isPathEqualOrDescendant(path, workspacePath) ||
					path === workspacePath,
			)
		) {
			return
		}

		if (targets.length === 1) {
			await fileSystem.moveToTrash(targets[0])
		} else {
			await fileSystem.moveManyToTrash(targets)
		}
		if (isCurrent(sessionId)) {
			registerLocalMutation(targets.map((path) => ({ path, scope: "subtree" })))
			await tree.entriesDeleted({ paths: targets, preserveUnsaved: true })
		}
	}

	const renameEntry = async (
		entry: WorkspaceEntry,
		newName: string,
		options?: RenameEntryOptions,
	) => {
		const { workspacePath, sessionId } = getSnapshot()
		if (
			!workspacePath ||
			!newName ||
			newName === entry.name ||
			isLocked([entry.path], options?.allowLockedSourcePath)
		) {
			return entry.path
		}
		const error = getPortableEntryNameValidationError(newName)
		if (error) {
			throw new Error(error)
		}
		const targets = await resolveMutationPaths([entry.path])
		if (!targets || !isCurrent(sessionId)) {
			return entry.path
		}
		const [sourcePath] = targets
		const newPath = join(dirname(sourcePath), newName)
		if (
			sourcePath === newPath ||
			!isPathEqualOrDescendant(sourcePath, workspacePath)
		) {
			return sourcePath
		}
		const isCaseOnly = newPath.toLowerCase() === sourcePath.toLowerCase()
		if (!isCaseOnly && (await fileSystem.exists(newPath))) {
			return sourcePath
		}
		if (
			!isCurrent(sessionId) ||
			isLocked([sourcePath], options?.allowLockedSourcePath)
		) {
			return sourcePath
		}

		const releaseRename = documents.reserveDocumentRename(sourcePath, newPath)
		try {
			await fileSystem.rename(sourcePath, newPath)
			if (isCurrent(sessionId)) {
				registerTransfer(sourcePath, newPath, entry.isDirectory)
				await tree.entryRenamed({
					oldPath: sourcePath,
					newPath,
					isDirectory: entry.isDirectory,
					newName,
				})
			}
		} finally {
			releaseRename()
		}
		return newPath
	}

	const moveEntry = async (
		sourcePath: string,
		destinationDirPath: string,
		options?: MoveEntryOptions,
	) => {
		const { workspacePath, sessionId } = getSnapshot()
		if (
			!workspacePath ||
			isLocked([sourcePath], options?.allowLockedSourcePath) ||
			![sourcePath, destinationDirPath].every((path) =>
				isPathEqualOrDescendant(path, workspacePath),
			) ||
			isPathEqualOrDescendant(destinationDirPath, sourcePath)
		) {
			return false
		}
		try {
			const targets = await resolveMutationPaths([sourcePath])
			if (!targets || !isCurrent(sessionId)) {
				return false
			}
			const [currentPath] = targets
			const entry = tree.getEntryByPath(currentPath)
			if (!entry || !isPathEqualOrDescendant(currentPath, workspacePath)) {
				return false
			}
			let newPath = join(destinationDirPath, getFileNameFromPath(currentPath))
			if (await fileSystem.exists(newPath)) {
				if (options?.onConflict !== "auto-rename") {
					return false
				}
				newPath = (
					await generateUniqueFileName(
						getFileNameFromPath(currentPath),
						destinationDirPath,
						fileSystem.exists.bind(fileSystem),
						{ pattern: "parentheses" },
					)
				).fullPath
			}
			if (
				!isCurrent(sessionId) ||
				isLocked([currentPath], options?.allowLockedSourcePath)
			) {
				return false
			}

			const releaseRename = documents.reserveDocumentRename(
				currentPath,
				newPath,
			)
			try {
				await fileSystem.rename(currentPath, newPath)
				if (isCurrent(sessionId)) {
					registerTransfer(currentPath, newPath, entry.isDirectory)
					await tree.entryMoved({
						sourcePath: currentPath,
						destinationDirPath,
						newPath,
						isDirectory: entry.isDirectory,
					})
				}
			} finally {
				releaseRename()
			}
			try {
				options?.onMoved?.(newPath)
			} catch (error) {
				console.error("Move completed but callback failed:", error)
			}
			return true
		} catch (error) {
			console.error(
				"Failed to move entry:",
				sourcePath,
				destinationDirPath,
				error,
			)
			return false
		}
	}

	const transferExternalEntry = async (
		sourcePath: string,
		destinationDirPath: string,
		operation: "copy" | "move",
	) => {
		const { workspacePath, sessionId } = getSnapshot()
		if (
			!workspacePath ||
			!isPathEqualOrDescendant(destinationDirPath, workspacePath) ||
			isPathEqualOrDescendant(destinationDirPath, sourcePath)
		) {
			return null
		}

		try {
			const fileName = getFileNameFromPath(sourcePath)
			const [{ fullPath }, source] = await Promise.all([
				generateUniqueFileName(
					fileName,
					destinationDirPath,
					fileSystem.exists.bind(fileSystem),
					{ pattern: "parentheses" },
				),
				fileSystem.stat(sourcePath),
			])
			if (!isCurrent(sessionId)) {
				return null
			}

			if (operation === "move") {
				await fileSystem.rename(sourcePath, fullPath)
			} else {
				await fileSystem.copy(sourcePath, fullPath)
			}
			if (!isCurrent(sessionId)) {
				return fullPath
			}
			registerLocalMutation([
				{ path: fullPath, scope: source.isDirectory ? "subtree" : "exact" },
			])
			const [metadata, children] = await Promise.all([
				fileSystem.stat(fullPath),
				source.isDirectory
					? tree.readWorkspaceEntriesFromPath(fullPath)
					: undefined,
			])
			if (isCurrent(sessionId)) {
				await tree.entryCreated({
					parentPath: destinationDirPath,
					entry: {
						path: fullPath,
						name: getFileNameFromPath(fullPath),
						isDirectory: source.isDirectory,
						children,
						createdAt: metadata.birthtime
							? new Date(metadata.birthtime)
							: undefined,
						modifiedAt: metadata.mtime ? new Date(metadata.mtime) : undefined,
					},
					expandParent: source.isDirectory,
					expandNewDirectory: source.isDirectory,
				})
			}
			return fullPath
		} catch (error) {
			console.error(`Failed to ${operation} entry:`, error)
			return null
		}
	}

	return {
		createNote,
		createFolder,
		deleteEntries,
		deleteEntry: (path: string) => deleteEntries([path]),
		renameEntry,
		moveEntry,
		copyEntry: (sourcePath: string, destinationPath: string) =>
			transferExternalEntry(sourcePath, destinationPath, "copy"),
		moveExternalEntry: async (sourcePath: string, destinationPath: string) =>
			(await transferExternalEntry(sourcePath, destinationPath, "move")) !==
			null,
		createAndOpenNote: async () => {
			const { workspacePath, currentCollectionPath } = getSnapshot()
			if (!workspacePath) {
				return
			}
			const activePath = documents.getActiveTabPath()
			const directory =
				currentCollectionPath ??
				(activePath ? dirname(activePath) : workspacePath)
			await createNote(directory, { openTab: true })
		},
	}
}
