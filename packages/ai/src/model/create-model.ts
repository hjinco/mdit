import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { ollama } from "ollama-ai-provider-v2"
import type { AIChatConfig, AICodexModelOptions } from "../shared/chat-config"
import { buildCodexHeaders } from "./codex-headers"

export function createModelFromChatConfig(
	config: AIChatConfig,
	options?: { codex?: AICodexModelOptions },
) {
	switch (config.provider) {
		case "anthropic":
			return createAnthropic({
				apiKey: config.apiKey,
			})(config.model)
		case "google":
			return createGoogleGenerativeAI({
				apiKey: config.apiKey,
			})(config.model)
		case "openai":
			return createOpenAI({
				apiKey: config.apiKey,
			})(config.model)
		case "codex_oauth": {
			const codex = options?.codex
			if (!codex) {
				throw new Error("Codex options are required for codex_oauth provider.")
			}

			return createOpenAI({
				apiKey: config.apiKey,
				baseURL: codex.baseURL,
				headers: buildCodexHeaders({ chatConfig: config, codex }),
				fetch: codex.fetch,
			})(config.model)
		}
		case "ollama":
			return ollama(config.model)
		default:
			throw new Error(`Unsupported provider: ${config.provider}`)
	}
}
