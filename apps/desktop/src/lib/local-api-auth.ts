import { getAppSecret, setAppSecret } from "@mdit/credentials"

const LOCAL_API_TOKEN_BYTE_LENGTH = 32
const LOCAL_API_TOKEN_MIN_LENGTH = 32

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

export async function getLocalApiAuthToken(): Promise<string | null> {
	const token = await getAppSecret("local_api_token")
	if (!isValidLocalApiToken(token)) {
		return null
	}
	return token
}

export async function ensureLocalApiAuthToken(): Promise<string> {
	const existingToken = await getLocalApiAuthToken()
	if (isValidLocalApiToken(existingToken)) {
		return existingToken
	}

	const generatedToken = generateLocalApiToken()
	await setAppSecret("local_api_token", generatedToken)
	return generatedToken
}

export async function rotateLocalApiAuthToken(): Promise<string> {
	const generatedToken = generateLocalApiToken()
	await setAppSecret("local_api_token", generatedToken)
	return generatedToken
}
