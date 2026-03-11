import { describe, expect, it, vi } from "vitest"
import {
	verifyAuthSessionFromAuthorization,
	verifyAuthSessionFromHeaders,
} from "./session"

describe("verifyAuthSessionFromHeaders", () => {
	it("returns null without an authorization header", async () => {
		const getSession = vi.fn()

		await expect(
			verifyAuthSessionFromHeaders(
				{
					api: { getSession },
				},
				new Headers(),
			),
		).resolves.toBeNull()

		expect(getSession).not.toHaveBeenCalled()
	})

	it("maps a session lookup into a minimal verified session", async () => {
		const getSession = vi.fn().mockResolvedValue({
			session: {
				id: "session-1",
				userId: "user-1",
			},
		})
		const headers = new Headers({
			authorization: "Bearer token-123",
		})

		await expect(
			verifyAuthSessionFromHeaders(
				{
					api: { getSession },
				},
				headers,
			),
		).resolves.toEqual({
			userId: "user-1",
			sessionId: "session-1",
		})

		expect(getSession).toHaveBeenCalledWith({
			headers,
			query: {
				disableCookieCache: true,
				disableRefresh: true,
			},
		})
	})

	it("returns null when better-auth does not find a session", async () => {
		const getSession = vi.fn().mockResolvedValue(null)

		await expect(
			verifyAuthSessionFromAuthorization(
				{
					api: { getSession },
				},
				"Bearer token-123",
			),
		).resolves.toBeNull()
	})
})
