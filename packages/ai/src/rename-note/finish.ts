export type RenameToolResultLike = {
	toolName: string
	output?: unknown
}

export function isFinishRenameSuccessResult(toolResult: RenameToolResultLike) {
	if (toolResult.toolName !== "finish_rename") {
		return false
	}

	if (!toolResult.output || typeof toolResult.output !== "object") {
		return false
	}

	const output = toolResult.output as { success?: boolean }
	return output.success === true
}
