import { jsonSchema, type ToolSet, tool } from "ai"
import { dirname } from "pathe"
import { MAX_MOVE_NOTE_CONTEXT_LENGTH } from "./constants"
import {
	collectMoveDirectoryCatalogEntries,
	resolveMoveDirectoryPath,
} from "./directories"
import { type InternalOperationState, toPublicOperation } from "./operations"
import type {
	MoveNoteWithAIEntry,
	MoveNoteWithAIFileSystemPorts,
} from "./types"

export type MoveNoteTools = ToolSet

export function createMoveNoteTools(params: {
	fileSystem: MoveNoteWithAIFileSystemPorts
	workspacePath: string
	entriesToProcess: MoveNoteWithAIEntry[]
	candidateDirectories: string[]
	entryPathSet: Set<string>
	operationByPath: Map<string, InternalOperationState>
}): MoveNoteTools {
	const {
		fileSystem,
		workspacePath,
		entriesToProcess,
		candidateDirectories,
		entryPathSet,
		operationByPath,
	} = params

	return {
		list_targets: tool({
			description: "List target notes that must be organized.",
			inputSchema: jsonSchema({
				type: "object",
				properties: {},
				additionalProperties: false,
			}),
			execute: async () => ({
				targets: entriesToProcess.map((entry) => ({
					path: entry.path,
					name: entry.name,
					currentDirectoryPath: dirname(entry.path),
				})),
			}),
		}),
		list_directories: tool({
			description:
				"List available workspace-relative destination directories for verification or re-checking.",
			inputSchema: jsonSchema({
				type: "object",
				properties: {},
				additionalProperties: false,
			}),
			execute: async () => ({
				directories: collectMoveDirectoryCatalogEntries({
					workspacePath,
					candidateDirectories,
				}).map((entry) => entry.displayPath),
			}),
		}),
		read_note: tool({
			description: "Read target note content for classification.",
			inputSchema: jsonSchema<{ path: string }>({
				type: "object",
				properties: {
					path: {
						type: "string",
						description: "Absolute path of a target markdown note.",
					},
				},
				required: ["path"],
				additionalProperties: false,
			}),
			execute: async ({ path }: { path: string }) => {
				if (!entryPathSet.has(path)) {
					throw new Error("read_note path is not in target list.")
				}

				const content = await fileSystem.readTextFile(path)
				const truncatedContent =
					content.length > MAX_MOVE_NOTE_CONTEXT_LENGTH
						? `${content.slice(0, MAX_MOVE_NOTE_CONTEXT_LENGTH)}\n...`
						: content
				return { path, content: truncatedContent }
			},
		}),
		move_note: tool({
			description:
				"Move a target note to one existing destination directory using a workspace-relative destination folder.",
			inputSchema: jsonSchema<{
				sourcePath: string
				destinationDir: string
			}>({
				type: "object",
				properties: {
					sourcePath: {
						type: "string",
						description: "Absolute path of a target markdown note.",
					},
					destinationDir: {
						type: "string",
						description:
							"Workspace-relative path of an existing destination directory. Use '.' for the workspace root.",
					},
				},
				required: ["sourcePath", "destinationDir"],
				additionalProperties: false,
			}),
			execute: async ({
				sourcePath,
				destinationDir,
			}: {
				sourcePath: string
				destinationDir: string
			}) => {
				if (!entryPathSet.has(sourcePath)) {
					throw new Error("move_note sourcePath is not in target list.")
				}

				const destinationDirPath = resolveMoveDirectoryPath({
					workspacePath,
					candidateDirectories,
					destinationDir,
				})

				if (!destinationDirPath) {
					throw new Error(
						"move_note destinationDir is not in candidate directories.",
					)
				}

				const operation = operationByPath.get(sourcePath)
				if (!operation) {
					throw new Error("Operation state not found for sourcePath.")
				}

				if (operation.status !== "pending") {
					throw new Error("Target note was already processed.")
				}

				if (destinationDirPath === operation.currentDirectoryPath) {
					operation.status = "unchanged"
					operation.destinationDirPath = destinationDirPath
					return toPublicOperation(operation)
				}

				const moved = await fileSystem.moveEntry(
					sourcePath,
					destinationDirPath,
					{
						onConflict: "auto-rename",
						allowLockedSourcePath: true,
						onMoved: (newPath) => {
							operation.newPath = newPath
						},
					},
				)

				if (moved) {
					operation.status = "moved"
					operation.destinationDirPath = destinationDirPath
				} else {
					operation.status = "failed"
					operation.destinationDirPath = destinationDirPath
					operation.reason = "moveEntry returned false"
				}

				return toPublicOperation(operation)
			},
		}),
		finish_organization: tool({
			description: "Finish organization after all targets are handled.",
			inputSchema: jsonSchema({
				type: "object",
				properties: {},
				additionalProperties: false,
			}),
			execute: async () => {
				const pendingPaths = Array.from(operationByPath.values())
					.filter((operation) => operation.status === "pending")
					.map((operation) => operation.path)
				return {
					success: pendingPaths.length === 0,
					pendingPaths,
				}
			},
		}),
	}
}
