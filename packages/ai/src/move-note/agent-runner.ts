import { stepCountIs, ToolLoopAgent } from "ai"
import type { ProviderRequestOptions } from "../runtime/provider-request-options"
import { MAX_MOVE_NOTE_AGENT_STEPS } from "./constants"
import { isFinishSuccessResult, type ToolResultLike } from "./finish"
import type { MoveNoteTools } from "./tools"

export type AgentToolResult = ToolResultLike

export type RunAgentResult = {
	steps: Array<{
		toolResults: AgentToolResult[]
	}>
}

export type RunAgentFn = (args: {
	model: unknown
	prompt: string
	providerRequestOptions: ProviderRequestOptions
	tools: MoveNoteTools
}) => Promise<RunAgentResult>

export const runAgentWithDefaults: RunAgentFn = async ({
	model,
	prompt,
	providerRequestOptions,
	tools,
}) => {
	const steps: RunAgentResult["steps"] = []
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
					isFinishSuccessResult(toolResult as ToolResultLike),
				)
			},
			stepCountIs(MAX_MOVE_NOTE_AGENT_STEPS),
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
