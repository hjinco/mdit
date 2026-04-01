import { jsonSchema, type ToolSet, tool } from "ai"

export type PanelChatToolDeps = {
	readTextFile: (path: string) => Promise<string>
	getActiveDocumentPath: () => string | null
}

type ReadActiveDocumentResult = {
	path: string | null
	content: string | null
	error: string | null
}

const MAX_ACTIVE_DOCUMENT_LENGTH = 4000

export const PANEL_CHAT_TOOLS_SYSTEM_SUFFIX = `
You can call the tool read_active_document when you need the on-disk contents of the user's currently focused editor tab. Use it only when the question depends on that document; it reads from disk, so unsaved edits may not be included.`

export function createPanelChatTools(deps: PanelChatToolDeps): ToolSet {
	return {
		read_active_document: tool({
			description:
				"Read the markdown (or text) file open in the user's active editor tab from disk. Call only when answering requires that document's contents.",
			inputSchema: jsonSchema({
				type: "object",
				properties: {},
				additionalProperties: false,
			}),
			execute: async (): Promise<ReadActiveDocumentResult> => {
				const path = deps.getActiveDocumentPath()
				if (!path) {
					return {
						path: null,
						content: null,
						error: "No active document tab.",
					}
				}

				try {
					const raw = await deps.readTextFile(path)
					const content =
						raw.length > MAX_ACTIVE_DOCUMENT_LENGTH
							? `${raw.slice(0, MAX_ACTIVE_DOCUMENT_LENGTH)}\n...`
							: raw

					return { path, content, error: null }
				} catch (error) {
					const message =
						error instanceof Error && error.message
							? error.message
							: "Failed to read active document."
					return { path, content: null, error: message }
				}
			},
		}),
	}
}
