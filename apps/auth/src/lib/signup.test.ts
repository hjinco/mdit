import { describe, expect, it } from "vitest"
import { deriveSignupName, withDefaultSignupName } from "./signup"

describe("deriveSignupName", () => {
	it("uses the email local part", () => {
		expect(deriveSignupName("hello.world@example.com")).toBe("hello.world")
	})

	it("preserves aliases in the local part", () => {
		expect(deriveSignupName("hello+team@example.com")).toBe("hello+team")
	})
})

describe("withDefaultSignupName", () => {
	it("returns malformed bodies unchanged", () => {
		expect(withDefaultSignupName(null as never)).toBeNull()
		expect(withDefaultSignupName("paper@example.com" as never)).toBe(
			"paper@example.com",
		)
	})

	it("fills a missing name from the email local part", () => {
		expect(
			withDefaultSignupName({
				email: "paper@example.com",
				password: "secret",
			}),
		).toEqual({
			email: "paper@example.com",
			password: "secret",
			name: "paper",
		})
	})

	it("keeps an existing name", () => {
		expect(
			withDefaultSignupName({
				email: "paper@example.com",
				name: "Already Set",
			}),
		).toEqual({
			email: "paper@example.com",
			name: "Already Set",
		})
	})
})
