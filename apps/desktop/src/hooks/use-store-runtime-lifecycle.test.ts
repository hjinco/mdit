import { describe, expect, it, vi } from "vitest"
import { initializeStoreRuntime } from "./use-store-runtime-lifecycle"

describe("initializeStoreRuntime", () => {
	it("runs AI, hotkey, and ollama initialization in app runtime", () => {
		const loadAISettings = vi.fn().mockResolvedValue(undefined)
		const loadHotkeys = vi.fn().mockResolvedValue(undefined)
		const fetchOllamaModels = vi.fn().mockResolvedValue(undefined)

		initializeStoreRuntime({
			loadAISettings,
			loadHotkeys,
			fetchOllamaModels,
		})

		expect(loadAISettings).toHaveBeenCalledTimes(1)
		expect(loadHotkeys).toHaveBeenCalledTimes(1)
		expect(fetchOllamaModels).toHaveBeenCalledTimes(1)
	})
})
