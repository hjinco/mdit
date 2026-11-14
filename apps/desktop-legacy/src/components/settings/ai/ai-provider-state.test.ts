import { CREDENTIAL_PROVIDER_IDS } from "@mdit/ai"
import { describe, expect, it } from "vitest"
import {
	buildProviderModels,
	getCredentialProviderDefinitions,
	hasConnectedProviderModels,
} from "./ai-provider-state"

describe("ai provider state", () => {
	it("builds provider models from credential providers and ollama", () => {
		const provider = CREDENTIAL_PROVIDER_IDS[0]
		const providerModels = buildProviderModels(
			{
				[provider]: ["model-a"],
			},
			["llama3.2"],
		)

		expect(providerModels).toHaveLength(CREDENTIAL_PROVIDER_IDS.length + 1)
		expect(
			providerModels.find((entry) => entry.provider === provider)?.models,
		).toEqual(["model-a"])
		expect(
			providerModels.find((entry) => entry.provider === "ollama")?.models,
		).toEqual(["llama3.2"])
	})

	it("reports connected model availability", () => {
		expect(hasConnectedProviderModels([], [])).toBe(false)
		expect(hasConnectedProviderModels(["openai"], [])).toBe(true)
		expect(hasConnectedProviderModels([], ["llama3.2"])).toBe(true)
	})

	it("returns all credential provider definitions in id order", () => {
		expect(
			getCredentialProviderDefinitions().map((definition) => definition.id),
		).toEqual(CREDENTIAL_PROVIDER_IDS)
	})
})
