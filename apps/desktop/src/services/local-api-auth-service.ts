import {
	getPassword as getPasswordFromKeyring,
	setPassword as setPasswordInKeyring,
} from "tauri-plugin-keyring-api"

const LOCAL_API_TOKEN_SERVICE = "app.mdit"
const LOCAL_API_TOKEN_USER = "local_api"
const LOCAL_API_TOKEN_BYTE_LENGTH = 32
const LOCAL_API_TOKEN_MIN_LENGTH = 32
const LOCAL_API_STORE_VERSION = 1 as const

type LocalApiAuthStore = {
	version: typeof LOCAL_API_STORE_VERSION
	token: string
}

function generateLocalApiToken(): string {
	const cryptoApi = globalThis.crypto
	if (!cryptoApi) {
		throw new Error("Secure crypto API is unavailable")
	}

	const bytes = new Uint8Array(LOCAL_API_TOKEN_BYTE_LENGTH)
	cryptoApi.getRandomValues(bytes)
	return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
		"",
	)
}

function isValidLocalApiToken(value: string | null): value is string {
	return Boolean(value && value.trim().length >= LOCAL_API_TOKEN_MIN_LENGTH)
}

function isLocalApiAuthStore(value: unknown): value is LocalApiAuthStore {
	if (typeof value !== "object" || value === null) return false
	const o = value as Record<string, unknown>
	return (
		o.version === LOCAL_API_STORE_VERSION &&
		typeof o.token === "string" &&
		isValidLocalApiToken(o.token)
	)
}

function decodeLocalApiAuthStore(raw: string | null): LocalApiAuthStore | null {
	if (!raw?.trim()) return null
	try {
		const parsed = JSON.parse(raw) as unknown
		return isLocalApiAuthStore(parsed) ? parsed : null
	} catch {
		return null
	}
}

function encodeLocalApiAuthStore(store: LocalApiAuthStore): string {
	return JSON.stringify(store)
}

export async function getLocalApiAuthToken(): Promise<string | null> {
	const raw = await getPasswordFromKeyring(
		LOCAL_API_TOKEN_SERVICE,
		LOCAL_API_TOKEN_USER,
	)
	const store = decodeLocalApiAuthStore(raw)
	return store?.token ?? null
}

export async function ensureLocalApiAuthToken(): Promise<string> {
	const existingToken = await getLocalApiAuthToken()
	if (isValidLocalApiToken(existingToken)) {
		return existingToken
	}

	const generatedToken = generateLocalApiToken()
	await setPasswordInKeyring(
		LOCAL_API_TOKEN_SERVICE,
		LOCAL_API_TOKEN_USER,
		encodeLocalApiAuthStore({
			version: LOCAL_API_STORE_VERSION,
			token: generatedToken,
		}),
	)
	return generatedToken
}

export async function rotateLocalApiAuthToken(): Promise<string> {
	const generatedToken = generateLocalApiToken()
	await setPasswordInKeyring(
		LOCAL_API_TOKEN_SERVICE,
		LOCAL_API_TOKEN_USER,
		encodeLocalApiAuthStore({
			version: LOCAL_API_STORE_VERSION,
			token: generatedToken,
		}),
	)
	return generatedToken
}
