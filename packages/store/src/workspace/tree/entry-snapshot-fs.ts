import { join } from "pathe"
import type { FileSystemRepositoryLike } from "../workspace-dependencies"
import type { WorkspaceEntry } from "../workspace-state"
import { sortWorkspaceEntries } from "./domain/entry-tree"

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
