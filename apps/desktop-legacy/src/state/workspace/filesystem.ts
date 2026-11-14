import { join } from "pathe"
import { sortWorkspaceEntries } from "./entry-tree"
import type { FileSystemRepositoryLike, WorkspaceEntry } from "./types"

type WorkspaceEntryFileSystem = Pick<
	FileSystemRepositoryLike,
	"readDir" | "stat"
>

const EMPTY_CHILDREN: WorkspaceEntry[] = []

export async function readWorkspaceEntriesFromPath(
	path: string,
	fileSystemRepository: WorkspaceEntryFileSystem,
	visited: Set<string> = new Set<string>(),
): Promise<WorkspaceEntry[]> {
	if (visited.has(path)) {
		return []
	}

	visited.add(path)

	try {
		const rawEntries = await fileSystemRepository.readDir(path)
		const visibleEntries = rawEntries.filter(
			(entry) => Boolean(entry.name) && !entry.name.startsWith("."),
		)

		const entries = await Promise.all(
			visibleEntries.map(async (entry) => {
				const fullPath = join(path, entry.name)
				const workspaceEntry: WorkspaceEntry = {
					path: fullPath,
					name: entry.name,
					isDirectory: entry.isDirectory,
					children: entry.isDirectory ? EMPTY_CHILDREN : undefined,
					createdAt: undefined,
					modifiedAt: undefined,
				}

				if (entry.isDirectory) {
					try {
						if (visited.has(fullPath)) {
							console.warn(
								"Detected cyclic workspace entry, skipping recursion:",
								fullPath,
							)
							workspaceEntry.children = EMPTY_CHILDREN
						} else {
							const children = await readWorkspaceEntriesFromPath(
								fullPath,
								fileSystemRepository,
								visited,
							)
							workspaceEntry.children = children
						}
					} catch (error) {
						console.error("Failed to build workspace entry:", fullPath, error)
						workspaceEntry.children = EMPTY_CHILDREN
					}
				} else {
					try {
						const fileMetadata = await fileSystemRepository.stat(fullPath)
						if (fileMetadata.birthtime) {
							workspaceEntry.createdAt = new Date(fileMetadata.birthtime)
						}
						if (fileMetadata.mtime) {
							workspaceEntry.modifiedAt = new Date(fileMetadata.mtime)
						}
					} catch (error) {
						console.debug("Failed to get metadata for:", fullPath, error)
					}
				}

				return workspaceEntry
			}),
		)

		return sortWorkspaceEntries(entries)
	} catch (error) {
		console.error("Failed to read directory:", path, error)
		return []
	}
}

export type UniqueFileNamePattern = "space" | "parentheses"

export interface GenerateUniqueFileNameOptions {
	pattern?: UniqueFileNamePattern
	maxAttempts?: number
}

export interface UniqueFileNameResult {
	fileName: string
	fullPath: string
}

/**
 * Generates a unique file or folder name by appending a number suffix if the name already exists.
 * Supports two naming patterns:
 * - Space pattern: "name 1", "name 2" (preserves extension if present)
 * - Parentheses pattern: "name (1)", "name (2)" (preserves extension if present)
 *
 * @param baseName - The base file/folder name (with or without extension)
 * @param directoryPath - Target directory path
 * @param exists - Async function to check if a path exists
 * @param options - Optional configuration
 * @returns Object containing the unique fileName and fullPath
 *
 * @example
 * // Space pattern (default)
 * const result = await generateUniqueFileName('file.txt', '/path/to/dir', exists)
 * // Returns: { fileName: 'file 1.txt', fullPath: '/path/to/dir/file 1.txt' }
 *
 * @example
 * // Parentheses pattern
 * const result = await generateUniqueFileName('file.txt', '/path/to/dir', exists, { pattern: 'parentheses' })
 * // Returns: { fileName: 'file (1).txt', fullPath: '/path/to/dir/file (1).txt' }
 */
export async function generateUniqueFileName(
	baseName: string,
	directoryPath: string,
	exists: (path: string) => Promise<boolean>,
	options: GenerateUniqueFileNameOptions = {},
): Promise<UniqueFileNameResult> {
	return claimUniqueFileName(
		baseName,
		directoryPath,
		async (path) => !(await exists(path)),
		options,
	)
}

export async function claimUniqueFileName(
	baseName: string,
	directoryPath: string,
	claim: (path: string) => Promise<boolean>,
	options: GenerateUniqueFileNameOptions = {},
): Promise<UniqueFileNameResult> {
	const { pattern = "space", maxAttempts = 100 } = options

	// Extract extension if present
	const extIndex = baseName.lastIndexOf(".")
	const hasExtension = extIndex > 0
	const baseNameWithoutExt = hasExtension
		? baseName.slice(0, extIndex)
		: baseName
	const extension = hasExtension ? baseName.slice(extIndex) : ""

	let attempt = 0
	let fileName: string
	let fullPath: string

	while (attempt <= maxAttempts) {
		// Generate suffix based on pattern
		let suffix: string
		if (attempt === 0) {
			suffix = ""
		} else if (pattern === "parentheses") {
			suffix = ` (${attempt})`
		} else {
			// space pattern
			suffix = ` ${attempt}`
		}

		// Construct fileName with suffix and extension
		fileName = `${baseNameWithoutExt}${suffix}${extension}`
		fullPath = join(directoryPath, fileName)

		if (await claim(fullPath)) {
			return { fileName, fullPath }
		}

		attempt += 1
	}

	throw new Error(
		`Unable to generate unique filename after ${maxAttempts} attempts`,
	)
}
