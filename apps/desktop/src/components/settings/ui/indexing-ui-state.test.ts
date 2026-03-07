import { describe, expect, it } from "vitest"
import { getIndexingModelControlState } from "./indexing-ui-state"

describe("indexing model control state", () => {
	it("does not gate embedding model selection behind a license", () => {
		expect(getIndexingModelControlState()).toEqual({
			description: "Select the embedding model to use for indexing",
			placeholder: "Select a model",
			disabled: false,
		})
	})
})
