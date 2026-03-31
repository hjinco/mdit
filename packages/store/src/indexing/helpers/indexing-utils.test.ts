import { describe, expect, it } from "vitest"
import type { IndexingConfig } from "../indexing-types"
import {
	buildSelectedEmbeddingModel,
	calculateIndexingProgress,
	isIndexingEnabled,
	isModelChanging,
	parseEmbeddingModelValue,
	shouldShowModelChangeWarning,
} from "./indexing-utils"

describe("calculateIndexingProgress", () => {
	it("returns 0 when totalFiles is 0", () => {
		expect(calculateIndexingProgress(0, 0)).toBe(0)
		expect(calculateIndexingProgress(5, 0)).toBe(0)
	})

	it("returns 0 when totalFiles is negative", () => {
		expect(calculateIndexingProgress(5, -1)).toBe(0)
	})

	it("calculates correct percentage", () => {
		expect(calculateIndexingProgress(50, 100)).toBe(50)
		expect(calculateIndexingProgress(25, 100)).toBe(25)
		expect(calculateIndexingProgress(75, 100)).toBe(75)
	})

	it("clamps indexed count to total files", () => {
		expect(calculateIndexingProgress(150, 100)).toBe(100)
		expect(calculateIndexingProgress(200, 100)).toBe(100)
	})

	it("rounds to nearest integer", () => {
		expect(calculateIndexingProgress(33, 100)).toBe(33)
		expect(calculateIndexingProgress(66, 100)).toBe(66)
		expect(calculateIndexingProgress(1, 3)).toBe(33)
	})
})

describe("parseEmbeddingModelValue", () => {
	it("parses provider|model format", () => {
		expect(parseEmbeddingModelValue("ollama|llama2")).toEqual({
			provider: "ollama",
			model: "llama2",
		})
	})

	it("handles model names with pipes", () => {
		expect(parseEmbeddingModelValue("ollama|some|model|name")).toEqual({
			provider: "ollama",
			model: "some|model|name",
		})
	})

	it("returns null for invalid formats", () => {
		expect(parseEmbeddingModelValue("invalid")).toBeNull()
		expect(parseEmbeddingModelValue("")).toBeNull()
		expect(parseEmbeddingModelValue("|")).toBeNull()
	})

	it("returns null when provider or model is empty", () => {
		expect(parseEmbeddingModelValue("provider|")).toBeNull()
		expect(parseEmbeddingModelValue("|model")).toBeNull()
	})
})

describe("isModelChanging", () => {
	it("returns true when no current config", () => {
		expect(isModelChanging(null, "ollama", "llama2")).toBe(true)
	})

	it("returns false when provider and model match", () => {
		const config: IndexingConfig = {
			embeddingProvider: "ollama",
			embeddingModel: "llama2",
		}
		expect(isModelChanging(config, "ollama", "llama2")).toBe(false)
	})

	it("returns true when provider changes", () => {
		const config: IndexingConfig = {
			embeddingProvider: "ollama",
			embeddingModel: "llama2",
		}
		expect(isModelChanging(config, "openai", "llama2")).toBe(true)
	})

	it("returns true when model changes", () => {
		const config: IndexingConfig = {
			embeddingProvider: "ollama",
			embeddingModel: "llama2",
		}
		expect(isModelChanging(config, "ollama", "llama3")).toBe(true)
	})

	it("returns true when both change", () => {
		const config: IndexingConfig = {
			embeddingProvider: "ollama",
			embeddingModel: "llama2",
		}
		expect(isModelChanging(config, "openai", "gpt-4")).toBe(true)
	})
})

describe("shouldShowModelChangeWarning", () => {
	it("returns true when model is changing and there are indexed docs", () => {
		expect(shouldShowModelChangeWarning(true, 5)).toBe(true)
		expect(shouldShowModelChangeWarning(true, 1)).toBe(true)
	})

	it("returns false when model is not changing", () => {
		expect(shouldShowModelChangeWarning(false, 5)).toBe(false)
		expect(shouldShowModelChangeWarning(false, 0)).toBe(false)
	})

	it("returns false when no indexed docs", () => {
		expect(shouldShowModelChangeWarning(true, 0)).toBe(false)
	})

	it("returns false when model not changing and no docs", () => {
		expect(shouldShowModelChangeWarning(false, 0)).toBe(false)
	})
})

describe("buildSelectedEmbeddingModel", () => {
	it("returns null when model is empty", () => {
		expect(buildSelectedEmbeddingModel("", "llama2", ["llama2"])).toBeNull()
	})

	it("returns null when provider is empty", () => {
		expect(buildSelectedEmbeddingModel("ollama", "", ["llama2"])).toBeNull()
	})

	it("returns null when model not in available list", () => {
		expect(
			buildSelectedEmbeddingModel("ollama", "llama2", ["gpt-4"]),
		).toBeNull()
	})

	it("returns formatted string when valid", () => {
		expect(buildSelectedEmbeddingModel("ollama", "llama2", ["llama2"])).toBe(
			"ollama|llama2",
		)
	})

	it("returns null when available models list is empty", () => {
		expect(buildSelectedEmbeddingModel("ollama", "llama2", [])).toBeNull()
	})
})

describe("isIndexingEnabled", () => {
	it("returns false when no model selected", () => {
		expect(isIndexingEnabled(null, false, false)).toBe(false)
	})

	it("returns false when already indexing", () => {
		expect(isIndexingEnabled("ollama|llama2", true, false)).toBe(false)
	})

	it("returns false when meta is loading", () => {
		expect(isIndexingEnabled("ollama|llama2", false, true)).toBe(false)
	})

	it("returns true when all conditions met", () => {
		expect(isIndexingEnabled("ollama|llama2", false, false)).toBe(true)
	})

	it("returns false when both indexing and loading", () => {
		expect(isIndexingEnabled("ollama|llama2", true, true)).toBe(false)
	})
})
