import { invoke } from "@tauri-apps/api/core"

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

function normalizeCodexCredential(
	credential: CodexOAuthCredential,
): CodexOAuthCredential {
	return {
		...credential,
		accountId: credential.accountId ?? undefined,
	}
}

function normalizeCredential(
	credential: ProviderCredential | null,
): ProviderCredential | null {
	if (!credential || credential.type !== "oauth") {
		return credential
	}
	return normalizeCodexCredential(credential)
}

export async function listCredentialProviders(): Promise<ProviderId[]> {
	return invoke("list_credential_providers_command")
}

export async function getCredential(
	providerId: ProviderId,
): Promise<ProviderCredential | null> {
	const credential = await invoke<ProviderCredential | null>(
		"get_credential_command",
		{ providerId },
	)
	return normalizeCredential(credential)
}

export async function setApiKeyCredential(
	providerId: ApiKeyProviderId,
	apiKey: string,
): Promise<void> {
	await invoke("set_api_key_credential_command", { providerId, apiKey })
}

export async function setCodexCredential(
	credential: CodexOAuthCredential,
): Promise<void> {
	await invoke("set_codex_credential_command", { credential })
}

export async function deleteCredential(providerId: ProviderId): Promise<void> {
	await invoke("delete_credential_command", { providerId })
}

export async function getAppSecret(key: AppSecretKey): Promise<string | null> {
	return invoke("get_app_secret_command", { key })
}

export async function setAppSecret(
	key: AppSecretKey,
	value: string,
): Promise<void> {
	await invoke("set_app_secret_command", { key, value })
}

export async function deleteAppSecret(key: AppSecretKey): Promise<void> {
	await invoke("delete_app_secret_command", { key })
}
