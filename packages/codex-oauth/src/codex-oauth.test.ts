import { beforeEach, describe, expect, it, vi } from "vitest"

const { cancelMock, onInvalidUrlMock, onUrlMock, openUrlMock, startMock } =
	vi.hoisted(() => {
		return {
			cancelMock: vi.fn(),
			onInvalidUrlMock: vi.fn(),
			onUrlMock: vi.fn(),
			openUrlMock: vi.fn(),
			startMock: vi.fn(),
		}
	})

vi.mock("@fabianlars/tauri-plugin-oauth", () => ({
	cancel: cancelMock,
	onInvalidUrl: onInvalidUrlMock,
	onUrl: onUrlMock,
	start: startMock,
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: openUrlMock,
}))

import {
	isCodexCredentialExpiringSoon,
	refreshCodexAccessToken,
	startCodexBrowserOAuth,
} from "./codex-oauth"

function createJwt(payload: Record<string, unknown>): string {
	const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
	return `header.${encoded}.signature`
}

describe("codex oauth", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		startMock.mockResolvedValue(1455)
		cancelMock.mockResolvedValue(undefined)
		onUrlMock.mockResolvedValue(() => {})
		onInvalidUrlMock.mockResolvedValue(() => {})
		openUrlMock.mockResolvedValue(undefined)
		vi.stubGlobal("fetch", vi.fn())
	})

	it("maps refresh response and extracts account id from id token", async () => {
		const now = Date.now()
		vi.spyOn(Date, "now").mockReturnValue(now)

		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				id_token: createJwt({ chatgpt_account_id: "org-id-token" }),
				access_token: "access-token",
				refresh_token: "refresh-token",
				expires_in: 120,
			}),
		} as Response)

		await expect(refreshCodexAccessToken("refresh-token")).resolves.toEqual({
			accessToken: "access-token",
			refreshToken: "refresh-token",
			expiresAt: now + 120_000,
			accountId: "org-id-token",
		})
	})

	it("uses access token claims when id token account id is absent", async () => {
		const now = Date.now()
		vi.spyOn(Date, "now").mockReturnValue(now)

		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				id_token: createJwt({ email: "test@example.com" }),
				access_token: createJwt({
					"https://api.openai.com/auth": {
						chatgpt_account_id: "org-access-token",
					},
				}),
				refresh_token: "refresh-token",
			}),
		} as Response)

		await expect(refreshCodexAccessToken("refresh-token")).resolves.toEqual({
			accessToken: createJwt({
				"https://api.openai.com/auth": {
					chatgpt_account_id: "org-access-token",
				},
			}),
			refreshToken: "refresh-token",
			expiresAt: now + 3_600_000,
			accountId: "org-access-token",
		})
	})

	it("completes browser oauth flow and validates callback state", async () => {
		const now = Date.now()
		vi.spyOn(Date, "now").mockReturnValue(now)

		let onUrlCallback: ((payload: unknown) => void) | undefined
		onUrlMock.mockImplementation(async (callback) => {
			onUrlCallback = callback
			return () => {}
		})

		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				id_token: createJwt({ organizations: [{ id: "org-browser" }] }),
				access_token: "browser-access",
				refresh_token: "browser-refresh",
				expires_in: 60,
			}),
		} as Response)

		openUrlMock.mockImplementation(async (url: string) => {
			const parsed = new URL(url)
			onUrlCallback?.(
				`http://localhost:1455/auth/callback?code=auth-code&state=${parsed.searchParams.get("state")}`,
			)
		})

		await expect(startCodexBrowserOAuth()).resolves.toEqual({
			accessToken: "browser-access",
			refreshToken: "browser-refresh",
			expiresAt: now + 60_000,
			accountId: "org-browser",
		})
		expect(startMock).toHaveBeenCalledWith({ ports: [1455] })
		expect(cancelMock).toHaveBeenCalledWith(1455)
	})

	it("rejects invalid callback url payloads", async () => {
		let onUrlCallback: ((payload: unknown) => void) | undefined
		onUrlMock.mockImplementation(async (callback) => {
			onUrlCallback = callback
			return () => {}
		})

		openUrlMock.mockImplementation(async () => {
			onUrlCallback?.({ nope: true })
		})

		await expect(startCodexBrowserOAuth()).rejects.toThrow(
			"Invalid OAuth callback URL",
		)
	})

	it("treats credentials inside the refresh window as expiring soon", () => {
		const now = Date.now()
		vi.spyOn(Date, "now").mockReturnValue(now)

		expect(isCodexCredentialExpiringSoon({ expiresAt: now + 30_000 })).toBe(
			true,
		)
		expect(isCodexCredentialExpiringSoon({ expiresAt: now + 300_000 })).toBe(
			false,
		)
	})
})
