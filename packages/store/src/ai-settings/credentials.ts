export type ProviderId = "openai" | "google" | "anthropic" | "codex_oauth"
export type ApiKeyProviderId = Exclude<ProviderId, "codex_oauth">
export type AppSecretKey = "local_api_token" | "license_key"

export type ApiKeyCredential = {
	type: "api_key"
	apiKey: string
}

export type CodexOAuthCredential = {
	type: "oauth"
	accessToken: string
	refreshToken: string
	expiresAt: number
	accountId?: string
}

export type ProviderCredential = ApiKeyCredential | CodexOAuthCredential
