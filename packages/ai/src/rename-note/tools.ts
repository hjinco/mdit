import { jsonSchema, type ToolSet, tool } from "ai"
import { MAX_NOTE_CONTEXT_LENGTH } from "./constants"
import {
	finalizeRenameOperations,
	type InternalOperationState,
} from "./operations"
import { stripExtension } from "./sanitize"
import type {
	RenameNoteWithAIDirEntry,
	RenameNoteWithAIEntry,
	RenameNoteWithAIFileSystemPorts,
} from "./types"

export type RenameNoteTools = ToolSet

export type CreateRenameNoteToolsParams = {
	fileSystem: RenameNoteWithAIFileSystemPorts
	entriesToProcess: RenameNoteWithAIEntry[]
	dirPath: string
	dirEntries: RenameNoteWithAIDirEntry[]
	siblingNoteNames: string[]
	entryPathSet: Set<string>
	operationByPath: Map<string, InternalOperationState>
	suggestionByPath: Map<string, string>
}

export function createRenameNoteTools(
	params: CreateRenameNoteToolsParams,
): RenameNoteTools {
	const {
		fileSystem,
		entriesToProcess,
		dirPath,
		dirEntries,
		siblingNoteNames,
		entryPathSet,
		operationByPath,
		suggestionByPath,
	} = params
	let isFinalized = false

	return {
		list_targets: tool({
			description: "List target notes that must be renamed.",
			inputSchema: jsonSchema({
				type: "object",
				properties: {},
				additionalProperties: false,
			}),
			execute: async () => ({
				targets: entriesToProcess.map((entry) => ({
					path: entry.path,
					name: entry.name,
					currentTitle: stripExtension(entry.name, ".md"),
				})),
			}),
		}),
		list_sibling_notes: tool({
			description:
				"List other markdown note names that already exist in the same folder.",
			inputSchema: jsonSchema({
				type: "object",
				properties: {},
				additionalProperties: false,
			}),
			execute: async () => ({
				dirPath,
				noteNames: siblingNoteNames,
			}),
		}),
		read_note: tool({
			description: "Read target note content for title generation.",
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
					content.length > MAX_NOTE_CONTEXT_LENGTH
						? `${content.slice(0, MAX_NOTE_CONTEXT_LENGTH)}\n...`
						: content
				return { path, content: truncatedContent }
			},
		}),
		set_title: tool({
			description: "Set a proposed title for one target note.",
			inputSchema: jsonSchema<{
				path: string
				title: string
			}>({
				type: "object",
				properties: {
					path: {
						type: "string",
						description: "Absolute path of a target markdown note.",
					},
					title: {
						type: "string",
						description: "Suggested title without file extension.",
					},
				},
				required: ["path", "title"],
				additionalProperties: false,
			}),
			execute: async ({ path, title }: { path: string; title: string }) => {
				if (!entryPathSet.has(path)) {
					throw new Error("set_title path is not in target list.")
				}

				if (isFinalized) {
					throw new Error("Cannot call set_title after finish_rename.")
				}

				suggestionByPath.set(path, title)
				return { path, title }
			},
		}),
		finish_rename: tool({
			description:
				"Finalize suggestions and resolve missing suggestions and filename collisions.",
			inputSchema: jsonSchema({
				type: "object",
				properties: {},
				additionalProperties: false,
			}),
			execute: async () => {
				const pendingPaths = entriesToProcess
					.filter((entry) => !suggestionByPath.has(entry.path))
					.map((entry) => entry.path)

				if (pendingPaths.length > 0) {
					return {
						success: false,
						pendingPaths,
					}
				}

				if (!isFinalized) {
					await finalizeRenameOperations({
						entriesToProcess,
						operationByPath,
						suggestionByPath,
						dirEntries,
						dirPath,
						exists: fileSystem.exists,
					})
					isFinalized = true
				}

				return {
					success: true,
					pendingPaths: [],
				}
			},
		}),
	}
}
