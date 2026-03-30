import { describe, expect, it } from "vitest"
import { API_MODELS_MAP } from "./provider-registry"

describe("provider-registry", () => {
	it("lists gpt-5.4 first for openai and codex oauth", () => {
		expect(API_MODELS_MAP.openai[0]).toBe("gpt-5.4")
		expect(API_MODELS_MAP.codex_oauth[0]).toBe("gpt-5.4")
	})
})
