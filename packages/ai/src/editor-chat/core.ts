import {
	editSystemSelecting,
	generateSystemDefault,
	generateSystemSelecting,
} from "./prompts"
import type { ToolName } from "./types"

export function resolveEditorChatToolName(params: {
	requestedToolName?: ToolName
	isSelecting: boolean
}): ToolName {
	return params.requestedToolName ?? (params.isSelecting ? "edit" : "generate")
}

export function getEditorChatSystemPrompt(params: {
	toolName: ToolName
	isSelecting: boolean
}): string {
	if (params.toolName === "generate") {
		return params.isSelecting ? generateSystemSelecting : generateSystemDefault
	}

	if (params.toolName === "edit") {
		return editSystemSelecting
	}

	throw new Error(`Unsupported tool: ${params.toolName}`)
}
