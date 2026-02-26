import { stepCountIs, ToolLoopAgent } from "ai"
import type { ProviderRequestOptions } from "../runtime/provider-request-options"
import { MAX_RENAME_NOTE_AGENT_STEPS } from "./constants"
import {
	isFinishRenameSuccessResult,
	type RenameToolResultLike,
} from "./finish"
import type { RenameNoteTools } from "./tools"

export type RenameAgentToolResult = RenameToolResultLike

export type RunRenameAgentResult = {
	steps: Array<{
		toolResults: RenameAgentToolResult[]
	}>
}

export type RunRenameAgentFn = (args: {
	model: unknown
	prompt: string
	providerRequestOptions: ProviderRequestOptions
	tools: RenameNoteTools
}) => Promise<RunRenameAgentResult>

export const runRenameAgentWithDefaults: RunRenameAgentFn = async ({
	model,
	prompt,
	providerRequestOptions,
	tools,
}) => {
	const steps: RunRenameAgentResult["steps"] = []
	const agent = new ToolLoopAgent({
		model: model as any,
		tools,
		...(providerRequestOptions.system
			? { instructions: providerRequestOptions.system }
			: {}),
		...(providerRequestOptions.providerOptions
			? { providerOptions: providerRequestOptions.providerOptions }
			: {}),
		stopWhen: [
			({ steps }) => {
				const lastStep = steps.at(-1)
				if (!lastStep) {
					return false
				}
				return lastStep.toolResults.some((toolResult) =>
					isFinishRenameSuccessResult(toolResult as RenameToolResultLike),
				)
			},
			stepCountIs(MAX_RENAME_NOTE_AGENT_STEPS),
		],
	})

	const result = await agent.stream({
		prompt,
		onStepFinish: (step) => {
			steps.push({
				toolResults: step.toolResults.map((toolResult) => ({
					toolName: toolResult.toolName,
					output: toolResult.output,
				})),
			})
		},
	})

	if (typeof result.consumeStream === "function") {
		await result.consumeStream()
	} else {
		for await (const _ of result.textStream) {
			// Consume stream to completion so all step callbacks run.
		}
	}

	return {
		steps,
	}
}
