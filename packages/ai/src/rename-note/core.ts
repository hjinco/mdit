import { dirname } from "pathe"
import { createModelFromChatConfig } from "../model/create-model"
import { buildProviderRequestOptions } from "../runtime/provider-request-options"
import {
	type RunRenameAgentFn,
	runRenameAgentWithDefaults,
} from "./agent-runner"
import { AI_RENAME_SYSTEM_PROMPT } from "./constants"
import { collectEntriesToProcess } from "./entries"
import { isFinishRenameSuccessResult } from "./finish"
import {
	countOperations,
	createOperationByPath,
	hasPendingOperations,
	toPublicOperation,
} from "./operations"
import { buildRenamePrompt } from "./prompt"
import { collectSiblingNoteNames } from "./sibling-notes"
import {
	type CreateRenameNoteToolsParams,
	createRenameNoteTools,
	type RenameNoteTools,
} from "./tools"
import type {
	RenameNoteWithAIBatchResult,
	RenameNoteWithAIChatConfig,
	RenameNoteWithAICodexOptions,
	RenameNoteWithAIEntry,
	RenameNoteWithAIFileSystemPorts,
} from "./types"

type CreateModelFn = (config: RenameNoteWithAIChatConfig) => unknown
type CreateToolsFn = (params: CreateRenameNoteToolsParams) => RenameNoteTools

function buildFailedBatchResult({
	entriesToProcess,
	dirPath,
	reason,
}: {
	entriesToProcess: RenameNoteWithAIEntry[]
	dirPath: string
	reason: string
}): RenameNoteWithAIBatchResult {
	return {
		renamedCount: 0,
		unchangedCount: 0,
		failedCount: entriesToProcess.length,
		operations: entriesToProcess.map((entry) => ({
			path: entry.path,
			status: "failed" as const,
			reason,
		})),
		dirPath,
	}
}

export function createModelFromRenameConfig(
	config: RenameNoteWithAIChatConfig,
	options?: RenameNoteWithAICodexOptions,
) {
	return createModelFromChatConfig(config, { codex: options })
}

export const createRenameNoteWithAICore = ({
	fileSystem,
	codex,
	createModel,
	runAgent,
	createTools,
}: {
	fileSystem: RenameNoteWithAIFileSystemPorts
	codex?: RenameNoteWithAICodexOptions
	createModel?: CreateModelFn
	runAgent?: RunRenameAgentFn
	createTools?: CreateToolsFn
}) => {
	const resolveModel: CreateModelFn =
		createModel ?? ((config) => createModelFromRenameConfig(config, codex))
	const executeAgent: RunRenameAgentFn = runAgent ?? runRenameAgentWithDefaults
	const buildTools: CreateToolsFn = createTools ?? createRenameNoteTools

	return {
		suggestRename: async ({
			entries,
			chatConfig,
		}: {
			entries: RenameNoteWithAIEntry[]
			chatConfig: RenameNoteWithAIChatConfig | null
		}): Promise<RenameNoteWithAIBatchResult | null> => {
			const entriesToProcess = collectEntriesToProcess(entries)
			if (!chatConfig || entriesToProcess.length === 0) {
				return null
			}

			const dirPathSet = new Set(
				entriesToProcess.map((entry) => dirname(entry.path)),
			)
			if (dirPathSet.size !== 1) {
				throw new Error(
					"All rename targets must be notes from the same folder.",
				)
			}
			const dirPath = Array.from(dirPathSet)[0]

			const dirEntries = await fileSystem.readDir(dirPath)
			const targetNameSet = new Set(entriesToProcess.map((entry) => entry.name))
			const siblingNoteNames = collectSiblingNoteNames(
				dirEntries,
				targetNameSet,
			)
			const entryPathSet = new Set(entriesToProcess.map((entry) => entry.path))
			const operationByPath = createOperationByPath(entriesToProcess)
			const suggestionByPath = new Map<string, string>()

			const tools = buildTools({
				fileSystem,
				entriesToProcess,
				dirPath,
				dirEntries,
				siblingNoteNames,
				entryPathSet,
				operationByPath,
				suggestionByPath,
			})
			const prompt = buildRenamePrompt({
				dirPath,
				entries: entriesToProcess,
			})
			const providerRequestOptions = buildProviderRequestOptions(
				chatConfig.provider,
				AI_RENAME_SYSTEM_PROMPT,
			)

			try {
				const result = await executeAgent({
					model: resolveModel(chatConfig),
					prompt,
					providerRequestOptions,
					tools,
				})

				const didFinishSuccessfully = result.steps.some((step) =>
					step.toolResults.some((toolResult) =>
						isFinishRenameSuccessResult(toolResult),
					),
				)
				if (!didFinishSuccessfully) {
					return buildFailedBatchResult({
						entriesToProcess,
						dirPath,
						reason: "Agent finished without successful finish_rename.",
					})
				}

				const operations = entriesToProcess.map((entry) => {
					const operation = operationByPath.get(entry.path)
					if (!operation) {
						throw new Error("Operation result missing for target entry.")
					}
					return operation
				})
				if (hasPendingOperations(operations)) {
					return buildFailedBatchResult({
						entriesToProcess,
						dirPath,
						reason: "Agent finished before processing all target notes.",
					})
				}

				const publicOperations = operations.map(toPublicOperation)
				const counts = countOperations(publicOperations)
				return {
					...counts,
					operations: publicOperations,
					dirPath,
				}
			} catch (error) {
				return buildFailedBatchResult({
					entriesToProcess,
					dirPath,
					reason:
						error instanceof Error
							? error.message
							: "Failed to run rename agent.",
				})
			}
		},
	}
}
