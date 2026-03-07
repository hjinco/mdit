import { describe, expect, it } from "vitest"
import { shouldRunLocalApiServer } from "./local-api-runtime"

describe("local-api runtime", () => {
	it("starts the local API server whenever the toggle is enabled", () => {
		expect(shouldRunLocalApiServer(true)).toBe(true)
	})

	it("stops the local API server whenever the toggle is disabled", () => {
		expect(shouldRunLocalApiServer(false)).toBe(false)
	})
})
