import type { ApiKeyProviderId, ProviderId } from "@mdit/ai"
import {
	deletePassword as deletePasswordFromKeyring,
	getPassword as getPasswordFromKeyring,
	setPassword as setPasswordFromKeyring,
} from "tauri-plugin-keyring-api"

export const AI_CREDENTIALS_SERVICE = "app.mdit"
export const AI_CREDENTIALS_USER = "credentials"

const CREDENTIAL_STORE_VERSION = 1 as const

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

export type ProviderCredentialMap = {
	google: ApiKeyCredential
	openai: ApiKeyCredential
	anthropic: ApiKeyCredential
	codex_oauth: CodexOAuthCredential
}

export type ProviderCredential = ProviderCredentialMap[ProviderId]

export type AppSecretKey = "local_api_token" | "license_key"

export type AppSecrets = {
	localApiToken?: string
	licenseKey?: string
}

export type CredentialStore = {
	version: typeof CREDENTIAL_STORE_VERSION
	providers: Partial<Record<ProviderId, ProviderCredential>>
	localApiToken?: string
	licenseKey?: string
}

export type KeyringApi = {
	getPassword: (service: string, user: string) => Promise<string | null>
	setPassword: (
		service: string,
		user: string,
		password: string,
	) => Promise<void>
	deletePassword: (service: string, user: string) => Promise<void>
}

const defaultKeyringApi: KeyringApi = {
	getPassword: getPasswordFromKeyring,
	setPassword: setPasswordFromKeyring,
	deletePassword: deletePasswordFromKeyring,
}

function createEmptyCredentialStore(): CredentialStore {
	return {
		version: CREDENTIAL_STORE_VERSION,
		providers: {},
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function isProviderId(value: unknown): value is ProviderId {
	return (
		value === "google" ||
		value === "openai" ||
		value === "anthropic" ||
		value === "codex_oauth"
	)
}

function isAppSecretKey(value: unknown): value is AppSecretKey {
	return value === "local_api_token" || value === "license_key"
}

function toStoreSecretKey(key: AppSecretKey): keyof AppSecrets {
	if (key === "local_api_token") {
		return "localApiToken"
	}
	return "licenseKey"
}

function isApiKeyCredential(value: unknown): value is ApiKeyCredential {
	if (!isRecord(value)) {
		return false
	}
	return value.type === "api_key" && typeof value.apiKey === "string"
}

function isCodexOAuthCredential(value: unknown): value is CodexOAuthCredential {
	if (!isRecord(value)) {
		return false
	}
	return (
		value.type === "oauth" &&
		typeof value.accessToken === "string" &&
		typeof value.refreshToken === "string" &&
		typeof value.expiresAt === "number" &&
		(value.accountId === undefined || typeof value.accountId === "string")
	)
}

function decodeCredential(
	providerId: ProviderId,
	value: unknown,
): ProviderCredential | null {
	if (providerId === "codex_oauth") {
		return isCodexOAuthCredential(value) ? value : null
	}
	return isApiKeyCredential(value) ? value : null
}

function decodeCredentialStore(raw: string): CredentialStore {
	try {
		const parsed = JSON.parse(raw) as unknown
		if (!isRecord(parsed)) {
			return createEmptyCredentialStore()
		}
		if (parsed.version !== CREDENTIAL_STORE_VERSION) {
			return createEmptyCredentialStore()
		}

		const providersRaw = parsed.providers
		if (!isRecord(providersRaw)) {
			return createEmptyCredentialStore()
		}

		const providers: Partial<Record<ProviderId, ProviderCredential>> = {}

		for (const [providerIdRaw, value] of Object.entries(providersRaw)) {
			if (!isProviderId(providerIdRaw)) {
				continue
			}
			const credential = decodeCredential(providerIdRaw, value)
			if (!credential) {
				continue
			}
			providers[providerIdRaw] = credential
		}

		const secrets: AppSecrets = {}

		if (typeof parsed.localApiToken === "string") {
			secrets.localApiToken = parsed.localApiToken
		}
		if (typeof parsed.licenseKey === "string") {
			secrets.licenseKey = parsed.licenseKey
		}

		const secretsRaw = parsed.secrets
		if (isRecord(secretsRaw)) {
			for (const [secretKeyRaw, secretValue] of Object.entries(secretsRaw)) {
				if (!isAppSecretKey(secretKeyRaw)) {
					continue
				}
				if (typeof secretValue !== "string") {
					continue
				}
				secrets[toStoreSecretKey(secretKeyRaw)] = secretValue
			}
		}

		return {
			version: CREDENTIAL_STORE_VERSION,
			providers,
			localApiToken: secrets.localApiToken,
			licenseKey: secrets.licenseKey,
		}
	} catch {
		return createEmptyCredentialStore()
	}
}

async function saveCredentialStore(
	store: CredentialStore,
	keyringApi: KeyringApi,
): Promise<void> {
	const hasProvider = Object.keys(store.providers).length > 0
	const hasSecret =
		typeof store.localApiToken === "string" ||
		typeof store.licenseKey === "string"
	if (!hasProvider && !hasSecret) {
		await keyringApi.deletePassword(AI_CREDENTIALS_SERVICE, AI_CREDENTIALS_USER)
		return
	}
	const encoded = JSON.stringify(store)
	await keyringApi.setPassword(
		AI_CREDENTIALS_SERVICE,
		AI_CREDENTIALS_USER,
		encoded,
	)
}

export async function loadCredentialStore(
	keyringApi: KeyringApi = defaultKeyringApi,
): Promise<CredentialStore> {
	const raw = await keyringApi.getPassword(
		AI_CREDENTIALS_SERVICE,
		AI_CREDENTIALS_USER,
	)
	if (!raw) {
		return createEmptyCredentialStore()
	}
	return decodeCredentialStore(raw)
}

export async function setApiKeyCredential(
	providerId: ApiKeyProviderId,
	apiKey: string,
	keyringApi: KeyringApi = defaultKeyringApi,
): Promise<void> {
	const normalizedApiKey = apiKey.trim()
	if (!normalizedApiKey) {
		throw new Error("API key is required")
	}

	const store = await loadCredentialStore(keyringApi)
	store.providers[providerId] = {
		type: "api_key",
		apiKey: normalizedApiKey,
	}
	await saveCredentialStore(store, keyringApi)
}

export async function setCodexCredential(
	credential: CodexOAuthCredential,
	keyringApi: KeyringApi = defaultKeyringApi,
): Promise<void> {
	if (!isCodexOAuthCredential(credential)) {
		throw new Error("Invalid Codex OAuth credential")
	}

	const store = await loadCredentialStore(keyringApi)
	store.providers.codex_oauth = credential
	await saveCredentialStore(store, keyringApi)
}

export async function deleteCredential(
	providerId: ProviderId,
	keyringApi: KeyringApi = defaultKeyringApi,
): Promise<void> {
	const store = await loadCredentialStore(keyringApi)
	delete store.providers[providerId]
	await saveCredentialStore(store, keyringApi)
}

export async function getCredential(
	providerId: ProviderId,
	keyringApi: KeyringApi = defaultKeyringApi,
): Promise<ProviderCredential | null> {
	const store = await loadCredentialStore(keyringApi)
	return store.providers[providerId] ?? null
}

export async function listCredentialProviders(
	keyringApi: KeyringApi = defaultKeyringApi,
): Promise<ProviderId[]> {
	const store = await loadCredentialStore(keyringApi)
	return Object.keys(store.providers).filter(isProviderId)
}

export async function getAppSecret(
	key: AppSecretKey,
	keyringApi: KeyringApi = defaultKeyringApi,
): Promise<string | null> {
	const store = await loadCredentialStore(keyringApi)
	const storeKey = toStoreSecretKey(key)
	return store[storeKey] ?? null
}

export async function setAppSecret(
	key: AppSecretKey,
	value: string,
	keyringApi: KeyringApi = defaultKeyringApi,
): Promise<void> {
	if (!value) {
		throw new Error("Secret value is required")
	}

	const store = await loadCredentialStore(keyringApi)
	const storeKey = toStoreSecretKey(key)
	store[storeKey] = value
	await saveCredentialStore(store, keyringApi)
}

export async function deleteAppSecret(
	key: AppSecretKey,
	keyringApi: KeyringApi = defaultKeyringApi,
): Promise<void> {
	const store = await loadCredentialStore(keyringApi)
	const storeKey = toStoreSecretKey(key)
	delete store[storeKey]
	await saveCredentialStore(store, keyringApi)
}
