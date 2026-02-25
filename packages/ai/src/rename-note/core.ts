import { streamText } from "ai"
import { dirname } from "pathe"
import { createModelFromChatConfig } from "../model/create-model"
import {
	buildProviderRequestOptions,
	type ProviderRequestOptions,
} from "../runtime/provider-request-options"
import { AI_RENAME_SYSTEM_PROMPT } from "./constants"
import { buildRenamePrompt } from "./prompt"
import { extractAndSanitizeName } from "./sanitize"
import { collectSiblingNoteNames } from "./sibling-notes"
import type {
	RenameNoteWithAIChatConfig,
	RenameNoteWithAICodexOptions,
	RenameNoteWithAIEntry,
	RenameNoteWithAIFileSystemPorts,
	RenameNoteWithAIResult,
} from "./types"
import { generateUniqueFileName } from "./unique-file-name"

type StreamTextFn = (
	args: {
		model: any
		prompt: string
	} & ProviderRequestOptions,
) => {
	text: PromiseLike<string>
}

type CreateModelFn = (config: RenameNoteWithAIChatConfig) => any

export function createModelFromRenameConfig(
	config: RenameNoteWithAIChatConfig,
	options?: RenameNoteWithAICodexOptions,
) {
	return createModelFromChatConfig(config, { codex: options })
}

export const createRenameNoteWithAICore = ({
	fileSystem,
	codex,
	streamTextFn,
	createModel,
}: {
	fileSystem: RenameNoteWithAIFileSystemPorts
	codex?: RenameNoteWithAICodexOptions
	streamTextFn?: StreamTextFn
	createModel?: CreateModelFn
}) => {
	const runStreamText: StreamTextFn = (args) => streamText(args)
	const resolveModel: CreateModelFn =
		createModel ?? ((config) => createModelFromRenameConfig(config, codex))

	return {
		suggestRename: async ({
			entry,
			chatConfig,
		}: {
			entry: RenameNoteWithAIEntry
			chatConfig: RenameNoteWithAIChatConfig | null
		}): Promise<RenameNoteWithAIResult | null> => {
			if (!chatConfig || entry.isDirectory || !entry.path.endsWith(".md")) {
				return null
			}

			const dirPath = dirname(entry.path)
			const rawContent = await fileSystem.readTextFile(entry.path)
			const dirEntries = await fileSystem.readDir(dirPath)
			const otherNoteNames = collectSiblingNoteNames(dirEntries, entry.name)
			const prompt = buildRenamePrompt({
				currentName: entry.name,
				otherNoteNames,
				content: rawContent,
				dirPath,
			})
			const streamTextArgs = {
				model: resolveModel(chatConfig),
				prompt,
				...buildProviderRequestOptions(
					chatConfig.provider,
					AI_RENAME_SYSTEM_PROMPT,
				),
			}

			const streamResult = (streamTextFn ?? runStreamText)(streamTextArgs)
			const aiText = await streamResult.text

			const suggestedBaseName = extractAndSanitizeName(aiText)
			if (!suggestedBaseName) {
				throw new Error("The AI did not return a usable name.")
			}

			const { fileName: finalFileName } = await generateUniqueFileName(
				`${suggestedBaseName}.md`,
				dirPath,
				fileSystem.exists,
			)

			return {
				finalFileName,
				suggestedBaseName,
				dirPath,
			}
		},
	}
}
