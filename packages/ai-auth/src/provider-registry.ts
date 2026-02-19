export type CredentialProviderId =
	| "google"
	| "openai"
	| "anthropic"
	| "codex_oauth"

export type ApiKeyProviderId = Exclude<CredentialProviderId, "codex_oauth">

export type ChatProviderId = CredentialProviderId | "ollama"

export type ProviderAuthKind = "api_key" | "oauth" | "host_url"

export type ProviderDefinition = {
	id: ChatProviderId
	label: string
	authKind: ProviderAuthKind
	settingsUrl: string | null
}

export const AI_PROVIDER_DEFINITIONS: Record<
	ChatProviderId,
	ProviderDefinition
> = {
	google: {
		id: "google",
		label: "Google Generative AI",
		authKind: "api_key",
		settingsUrl: "https://aistudio.google.com",
	},
	openai: {
		id: "openai",
		label: "OpenAI",
		authKind: "api_key",
		settingsUrl: "https://platform.openai.com",
	},
	anthropic: {
		id: "anthropic",
		label: "Anthropic",
		authKind: "api_key",
		settingsUrl: "https://console.anthropic.com",
	},
	codex_oauth: {
		id: "codex_oauth",
		label: "ChatGPT Codex",
		authKind: "oauth",
		settingsUrl: "https://chatgpt.com",
	},
	ollama: {
		id: "ollama",
		label: "Ollama",
		authKind: "host_url",
		settingsUrl: "https://ollama.com",
	},
}

export const API_MODELS_MAP: Record<CredentialProviderId, string[]> = {
	google: [
		"gemini-3-flash-preview",
		"gemini-2.5-flash",
		"gemini-2.5-flash-lite",
	],
	openai: ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano"],
	anthropic: ["claude-sonnet-4-5", "claude-haiku-4-5"],
	codex_oauth: ["gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.2"],
}

export const CREDENTIAL_PROVIDER_IDS = Object.keys(
	API_MODELS_MAP,
) as Array<CredentialProviderId>
