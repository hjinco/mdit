export type AIProvider =
	| "anthropic"
	| "google"
	| "openai"
	| "codex_oauth"
	| "ollama"

export type AIChatConfig = {
	provider: AIProvider
	model: string
	apiKey: string
	accountId?: string
}

export type AICodexModelOptions = {
	baseURL: string
	fetch: typeof fetch
	createSessionId?: () => string
	sessionId?: string
	headers?: Record<string, string>
}
