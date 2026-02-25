import { describe, expect, it, vi } from "vitest"
import { buildCodexHeaders } from "./codex-headers"

describe("buildCodexHeaders", () => {
	it("builds default codex headers and uses createSessionId", () => {
		const createSessionId = vi.fn(() => "session-from-factory")

		const headers = buildCodexHeaders({
			chatConfig: {},
			codex: {
				baseURL: "https://example.com",
				fetch: vi.fn() as unknown as typeof fetch,
				createSessionId,
			},
		})

		expect(createSessionId).toHaveBeenCalledTimes(1)
		expect(headers).toEqual(
			expect.objectContaining({
				originator: "mdit",
				"User-Agent": "mdit",
				"session-id": "session-from-factory",
			}),
		)
	})

	it("keeps custom header overrides and applies account id last", () => {
		const headers = buildCodexHeaders({
			chatConfig: {
				accountId: "org-from-config",
			},
			codex: {
				baseURL: "https://example.com",
				fetch: vi.fn() as unknown as typeof fetch,
				sessionId: "session-from-options",
				headers: {
					originator: "custom-originator",
					"session-id": "session-from-headers",
					"ChatGPT-Account-Id": "org-from-headers",
				},
			},
		})

		expect(headers.originator).toBe("custom-originator")
		expect(headers["session-id"]).toBe("session-from-headers")
		expect(headers["User-Agent"]).toBe("mdit")
		expect(headers["ChatGPT-Account-Id"]).toBe("org-from-config")
	})
})
