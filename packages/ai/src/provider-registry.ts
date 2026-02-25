export type ProviderId = "google" | "openai" | "anthropic" | "codex_oauth"

export type ApiKeyProviderId = Exclude<ProviderId, "codex_oauth">

export type ChatProviderId = ProviderId | "ollama"

export type ProviderAuthKind = "api_key" | "oauth" | "host_url"

type BaseProviderDefinition = {
	label: string
	settingsUrl: string | null
}

export type ApiKeyProviderDefinition = {
	[K in ApiKeyProviderId]: BaseProviderDefinition & {
		id: K
		authKind: "api_key"
	}
}[ApiKeyProviderId]

export type OAuthProviderDefinition = BaseProviderDefinition & {
	id: "codex_oauth"
	authKind: "oauth"
}

export type HostUrlProviderDefinition = BaseProviderDefinition & {
	id: "ollama"
	authKind: "host_url"
}

export type ProviderDefinition =
	| ApiKeyProviderDefinition
	| OAuthProviderDefinition
	| HostUrlProviderDefinition

type ProviderDefinitionMap = {
	[K in ChatProviderId]: Extract<ProviderDefinition, { id: K }>
}

export const AI_PROVIDER_DEFINITIONS: ProviderDefinitionMap = {
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

export const API_MODELS_MAP: Record<ProviderId, string[]> = {
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
) as Array<ProviderId>
