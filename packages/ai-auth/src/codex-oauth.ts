import {
	cancel,
	onInvalidUrl,
	onUrl,
	start,
} from "@fabianlars/tauri-plugin-oauth"
import { openUrl } from "@tauri-apps/plugin-opener"

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const CODEX_ISSUER = "https://auth.openai.com"
export const CODEX_API_ENDPOINT =
	"https://chatgpt.com/backend-api/codex/responses"
export const CODEX_BASE_URL = CODEX_API_ENDPOINT.replace(/\/responses\/?$/, "")

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_REFRESH_WINDOW_MS = 2 * 60 * 1000
const PKCE_CHARSET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

export interface PkceCodes {
	verifier: string
	challenge: string
}

export interface TokenResponse {
	id_token: string
	access_token: string
	refresh_token: string
	expires_in?: number
}

export interface IdTokenClaims {
	chatgpt_account_id?: string
	organizations?: Array<{ id: string }>
	email?: string
	"https://api.openai.com/auth"?: {
		chatgpt_account_id?: string
	}
}

export type CodexOAuthResult = {
	accessToken: string
	refreshToken: string
	expiresAt: number
	accountId?: string
}

function base64UrlEncode(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	let binary = ""
	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function generateRandomString(length: number): string {
	const bytes = crypto.getRandomValues(new Uint8Array(length))
	return Array.from(bytes)
		.map((byte) => PKCE_CHARSET[byte % PKCE_CHARSET.length])
		.join("")
}

function decodeBase64UrlJson<T>(input: string): T | undefined {
	try {
		const normalized = input.replace(/-/g, "+").replace(/_/g, "/")
		const padding = normalized.length % 4
		const padded =
			padding === 0 ? normalized : normalized + "=".repeat(4 - padding)
		const binary = atob(padded)
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
		const json = new TextDecoder().decode(bytes)
		return JSON.parse(json) as T
	} catch {
		return undefined
	}
}

async function generatePkce(): Promise<PkceCodes> {
	const verifier = generateRandomString(43)
	const data = new TextEncoder().encode(verifier)
	const hash = await crypto.subtle.digest("SHA-256", data)
	const challenge = base64UrlEncode(hash)
	return { verifier, challenge }
}

function generateState(): string {
	return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer)
}

function buildAuthorizeUrl(
	redirectUri: string,
	pkce: PkceCodes,
	state: string,
): string {
	const params = new URLSearchParams({
		response_type: "code",
		client_id: CODEX_CLIENT_ID,
		redirect_uri: redirectUri,
		scope: "openid profile email offline_access",
		code_challenge: pkce.challenge,
		code_challenge_method: "S256",
		id_token_add_organizations: "true",
		codex_cli_simplified_flow: "true",
		state,
		originator: "mdit",
	})
	return `${CODEX_ISSUER}/oauth/authorize?${params.toString()}`
}

async function exchangeCodeForTokens(
	code: string,
	redirectUri: string,
	pkce: PkceCodes,
): Promise<TokenResponse> {
	const response = await fetch(`${CODEX_ISSUER}/oauth/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
			client_id: CODEX_CLIENT_ID,
			code_verifier: pkce.verifier,
		}).toString(),
	})

	if (!response.ok) {
		throw new Error(`Token exchange failed: ${response.status}`)
	}

	return response.json()
}

export async function refreshCodexAccessToken(
	refreshToken: string,
): Promise<CodexOAuthResult> {
	const response = await fetch(`${CODEX_ISSUER}/oauth/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: CODEX_CLIENT_ID,
		}).toString(),
	})
	if (!response.ok) {
		throw new Error(`Token refresh failed: ${response.status}`)
	}
	const tokens = (await response.json()) as TokenResponse

	return {
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
		accountId: extractAccountId(tokens),
	}
}

function parseJwtClaims(token: string): IdTokenClaims | undefined {
	const parts = token.split(".")
	if (parts.length !== 3) return undefined
	return decodeBase64UrlJson<IdTokenClaims>(parts[1])
}

function extractAccountIdFromClaims(claims: IdTokenClaims): string | undefined {
	return (
		claims.chatgpt_account_id ||
		claims["https://api.openai.com/auth"]?.chatgpt_account_id ||
		claims.organizations?.[0]?.id
	)
}

function extractAccountId(tokens: TokenResponse): string | undefined {
	if (tokens.id_token) {
		const claims = parseJwtClaims(tokens.id_token)
		const accountId = claims && extractAccountIdFromClaims(claims)
		if (accountId) return accountId
	}
	if (tokens.access_token) {
		const claims = parseJwtClaims(tokens.access_token)
		return claims ? extractAccountIdFromClaims(claims) : undefined
	}
	return undefined
}

function formatUnknownError(error: unknown): string {
	if (error instanceof Error) return error.message
	if (typeof error === "string") return error
	try {
		return JSON.stringify(error)
	} catch {
		return "Unknown error"
	}
}

function extractUrl(payload: unknown): string | undefined {
	if (typeof payload === "string") {
		return payload
	}
	if (payload && typeof payload === "object" && "url" in payload) {
		const value = (payload as { url?: unknown }).url
		return typeof value === "string" ? value : undefined
	}
	return undefined
}

export async function startCodexBrowserOAuth(): Promise<CodexOAuthResult> {
	let port: number | undefined
	let unlistenUrl: (() => void) | undefined
	let unlistenInvalid: (() => void) | undefined

	try {
		port = await start({ ports: [1455] })
		if (port !== 1455) {
			throw new Error("Failed to start OAuth server")
		}

		const redirectUri = `http://localhost:${port}/auth/callback`
		const pkce = await generatePkce()
		const state = generateState()
		const authUrl = buildAuthorizeUrl(redirectUri, pkce, state)

		let resolveCallback: ((url: string) => void) | undefined
		let rejectCallback: ((error: Error) => void) | undefined
		const callbackPromise = new Promise<string>((resolve, reject) => {
			resolveCallback = resolve
			rejectCallback = reject
			let settled = false

			const timeoutId = window.setTimeout(() => {
				if (settled) return
				settled = true
				reject(
					new Error("OAuth callback timeout - authorization took too long"),
				)
			}, OAUTH_TIMEOUT_MS)

			const settle = (fn: () => void) => {
				if (settled) return
				settled = true
				window.clearTimeout(timeoutId)
				fn()
			}

			resolveCallback = (urlValue) => settle(() => resolve(urlValue))
			rejectCallback = (error) => settle(() => reject(error))
		})

		unlistenUrl = await onUrl((payload: unknown) => {
			const urlValue = extractUrl(payload)
			if (!urlValue) {
				rejectCallback?.(new Error("Invalid OAuth callback URL"))
				return
			}
			resolveCallback?.(urlValue)
		})

		unlistenInvalid = await onInvalidUrl((payload: unknown) => {
			const urlValue = extractUrl(payload)
			const message = urlValue
				? `Invalid OAuth callback URL: ${urlValue}`
				: "Invalid OAuth callback URL"
			rejectCallback?.(new Error(message))
		})

		try {
			await openUrl(authUrl)
		} catch (error) {
			throw new Error(`Failed to open browser: ${formatUnknownError(error)}`)
		}

		const callbackUrl = new URL(await callbackPromise)
		const error = callbackUrl.searchParams.get("error")
		const errorDescription = callbackUrl.searchParams.get("error_description")
		if (error) {
			throw new Error(errorDescription || error)
		}

		const code = callbackUrl.searchParams.get("code")
		const returnedState = callbackUrl.searchParams.get("state")
		if (!code) {
			throw new Error("Missing authorization code")
		}
		if (!returnedState || returnedState !== state) {
			throw new Error("Invalid state - potential CSRF attack")
		}

		const tokens = await exchangeCodeForTokens(code, redirectUri, pkce)
		return {
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
			accountId: extractAccountId(tokens),
		}
	} finally {
		unlistenUrl?.()
		unlistenInvalid?.()
		if (port !== undefined) {
			try {
				await cancel(port)
			} catch {
				// Ignore cleanup errors
			}
		}
	}
}

export function isCodexCredentialExpiringSoon(
	credential: Pick<CodexOAuthResult, "expiresAt">,
	refreshWindowMs = DEFAULT_REFRESH_WINDOW_MS,
): boolean {
	return credential.expiresAt <= Date.now() + refreshWindowMs
}
