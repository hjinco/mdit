import { createModelFromChatConfig } from "../model/create-model"
import { buildProviderRequestOptions } from "../runtime/provider-request-options"
import { type RunAgentFn, runAgentWithDefaults } from "./agent-runner"
import { AI_MOVE_NOTE_SYSTEM_PROMPT } from "./constants"
import { collectEntriesToProcess } from "./entries"
import { isFinishSuccessResult } from "./finish"
import {
	countOperations,
	createOperationByPath,
	hasPendingOperations,
	toPublicOperation,
} from "./operations"
import { buildMovePrompt } from "./prompt"
import { createMoveNoteTools } from "./tools"
import type {
	MoveNoteWithAIBatchResult,
	MoveNoteWithAIChatConfig,
	MoveNoteWithAICodexOptions,
	MoveNoteWithAIEntry,
	MoveNoteWithAIFileSystemPorts,
} from "./types"

type CreateModelFn = (config: MoveNoteWithAIChatConfig) => unknown

export function createModelFromMoveConfig(
	config: MoveNoteWithAIChatConfig,
	options?: MoveNoteWithAICodexOptions,
) {
	return createModelFromChatConfig(config, { codex: options })
}

export const createMoveNoteWithAICore = ({
	fileSystem,
	codex,
	createModel,
	runAgent,
}: {
	fileSystem: MoveNoteWithAIFileSystemPorts
	codex?: MoveNoteWithAICodexOptions
	createModel?: CreateModelFn
	runAgent?: RunAgentFn
}) => {
	const resolveModel: CreateModelFn =
		createModel ?? ((config) => createModelFromMoveConfig(config, codex))
	const executeAgent: RunAgentFn = runAgent ?? runAgentWithDefaults

	return {
		organizeNotes: async ({
			entries,
			workspacePath,
			candidateDirectories,
			chatConfig,
		}: {
			entries: MoveNoteWithAIEntry[]
			workspacePath: string
			candidateDirectories: string[]
			chatConfig: MoveNoteWithAIChatConfig | null
		}): Promise<MoveNoteWithAIBatchResult | null> => {
			if (
				!chatConfig ||
				candidateDirectories.length === 0 ||
				entries.length === 0
			) {
				return null
			}

			const entriesToProcess = collectEntriesToProcess(entries)
			if (entriesToProcess.length === 0) {
				return null
			}

			const entryPathSet = new Set(entriesToProcess.map((entry) => entry.path))
			const candidateDirectorySet = new Set(candidateDirectories)
			const operationByPath = createOperationByPath(entriesToProcess)
			const tools = createMoveNoteTools({
				fileSystem,
				entriesToProcess,
				candidateDirectories,
				entryPathSet,
				candidateDirectorySet,
				operationByPath,
			})

			const prompt = buildMovePrompt({
				workspacePath,
				entries: entriesToProcess,
				candidateDirectories,
			})
			const providerRequestOptions = buildProviderRequestOptions(
				chatConfig.provider,
				AI_MOVE_NOTE_SYSTEM_PROMPT,
			)

			const result = await executeAgent({
				model: resolveModel(chatConfig),
				prompt,
				providerRequestOptions,
				tools,
			})

			const didFinishSuccessfully = result.steps.some((step) =>
				step.toolResults.some((toolResult) =>
					isFinishSuccessResult(toolResult),
				),
			)
			if (!didFinishSuccessfully) {
				throw new Error(
					"Agent finished without successful finish_organization.",
				)
			}

			const operations = entriesToProcess.map((entry) => {
				const operation = operationByPath.get(entry.path)
				if (!operation) {
					throw new Error("Operation result missing for target entry.")
				}
				return operation
			})

			if (hasPendingOperations(operations)) {
				throw new Error("Agent finished before processing all target notes.")
			}

			const publicOperations = operations.map(toPublicOperation)
			const counts = countOperations(publicOperations)

			return {
				...counts,
				operations: publicOperations,
			}
		},
	}
}
