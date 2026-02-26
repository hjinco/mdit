import { jsonSchema, type ToolSet, tool } from "ai"
import { dirname } from "pathe"
import { MAX_MOVE_NOTE_CONTEXT_LENGTH } from "./constants"
import { type InternalOperationState, toPublicOperation } from "./operations"
import type {
	MoveNoteWithAIEntry,
	MoveNoteWithAIFileSystemPorts,
} from "./types"

export type MoveNoteTools = ToolSet

export function createMoveNoteTools(params: {
	fileSystem: MoveNoteWithAIFileSystemPorts
	entriesToProcess: MoveNoteWithAIEntry[]
	candidateDirectories: string[]
	entryPathSet: Set<string>
	candidateDirectorySet: Set<string>
	operationByPath: Map<string, InternalOperationState>
}): MoveNoteTools {
	const {
		fileSystem,
		entriesToProcess,
		candidateDirectories,
		entryPathSet,
		candidateDirectorySet,
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
			description: "List available destination directories in workspace.",
			inputSchema: jsonSchema({
				type: "object",
				properties: {},
				additionalProperties: false,
			}),
			execute: async () => ({
				directories: candidateDirectories,
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
			description: "Move a target note to one existing destination directory.",
			inputSchema: jsonSchema<{
				sourcePath: string
				destinationDirPath: string
			}>({
				type: "object",
				properties: {
					sourcePath: {
						type: "string",
						description: "Absolute path of a target markdown note.",
					},
					destinationDirPath: {
						type: "string",
						description: "Absolute path of an existing destination directory.",
					},
				},
				required: ["sourcePath", "destinationDirPath"],
				additionalProperties: false,
			}),
			execute: async ({
				sourcePath,
				destinationDirPath,
			}: {
				sourcePath: string
				destinationDirPath: string
			}) => {
				if (!entryPathSet.has(sourcePath)) {
					throw new Error("move_note sourcePath is not in target list.")
				}

				if (!candidateDirectorySet.has(destinationDirPath)) {
					throw new Error(
						"move_note destinationDirPath is not in candidate directories.",
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
