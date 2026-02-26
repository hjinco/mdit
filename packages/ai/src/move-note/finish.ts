export type ToolResultLike = {
	toolName: string
	output?: unknown
}

export function isFinishSuccessResult(toolResult: ToolResultLike) {
	if (toolResult.toolName !== "finish_organization") {
		return false
	}

	if (!toolResult.output || typeof toolResult.output !== "object") {
		return false
	}

	const output = toolResult.output as { success?: boolean }
	return output.success === true
}
