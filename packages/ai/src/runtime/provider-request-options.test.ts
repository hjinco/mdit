import { describe, expect, it } from "vitest"
import { buildProviderRequestOptions } from "./provider-request-options"

describe("buildProviderRequestOptions", () => {
	it("uses providerOptions instructions for codex oauth", () => {
		const result = buildProviderRequestOptions("codex_oauth", "prompt")

		expect(result).toEqual({
			providerOptions: {
				openai: {
					store: false,
					instructions: "prompt",
				},
			},
		})
	})

	it("uses system prompt for non-codex providers", () => {
		const result = buildProviderRequestOptions("openai", "prompt")

		expect(result).toEqual({
			system: "prompt",
		})
	})
})
