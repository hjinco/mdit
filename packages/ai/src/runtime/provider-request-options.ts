import type { AIProvider } from "../shared/chat-config"

export type ProviderRequestOptions = {
	system?: string
	providerOptions?: {
		openai?: {
			store?: boolean
			instructions?: string
		}
	}
}

export function buildProviderRequestOptions(
	provider: AIProvider,
	systemPrompt: string,
): ProviderRequestOptions {
	if (provider === "codex_oauth") {
		return {
			providerOptions: {
				openai: {
					store: false,
					instructions: systemPrompt,
				},
			},
		}
	}

	return {
		system: systemPrompt,
	}
}
