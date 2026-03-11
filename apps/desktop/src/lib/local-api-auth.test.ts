import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAppSecretMock, setAppSecretMock } = vi.hoisted(() => ({
	getAppSecretMock: vi.fn(),
	setAppSecretMock: vi.fn(),
}))

vi.mock("./credentials", () => ({
	getAppSecret: getAppSecretMock,
	setAppSecret: setAppSecretMock,
}))

import {
	ensureLocalApiAuthToken,
	getLocalApiAuthToken,
	rotateLocalApiAuthToken,
} from "./local-api-auth"

describe("local-api auth", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		getAppSecretMock.mockReset()
		setAppSecretMock.mockReset()
	})

	it("returns null when the stored token is invalid", async () => {
		getAppSecretMock.mockResolvedValue("short")

		await expect(getLocalApiAuthToken()).resolves.toBeNull()
	})

	it("reuses the stored token when it is already valid", async () => {
		getAppSecretMock.mockResolvedValue("a".repeat(64))

		await expect(ensureLocalApiAuthToken()).resolves.toBe("a".repeat(64))
		expect(setAppSecretMock).not.toHaveBeenCalled()
	})

	it("generates and persists a new token when missing", async () => {
		getAppSecretMock.mockResolvedValue(null)
		vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(
			(array) => {
				const bytes = array as Uint8Array
				bytes.set(new Uint8Array(bytes.byteLength).fill(0xab))
				return array
			},
		)

		const token = await ensureLocalApiAuthToken()

		expect(token).toHaveLength(64)
		expect(setAppSecretMock).toHaveBeenCalledWith("local_api_token", token)
	})

	it("rotates the token regardless of prior state", async () => {
		vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(
			(array) => {
				const bytes = array as Uint8Array
				bytes.set(new Uint8Array(bytes.byteLength).fill(0xcd))
				return array
			},
		)

		const token = await rotateLocalApiAuthToken()

		expect(token).toHaveLength(64)
		expect(setAppSecretMock).toHaveBeenCalledWith("local_api_token", token)
	})
})
