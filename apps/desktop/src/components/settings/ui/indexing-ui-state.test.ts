import { describe, expect, it } from "vitest"
import { INDEXING_MODEL_CONTROL_STATE } from "./indexing-ui-state"

describe("indexing model control state", () => {
	it("does not gate embedding model selection behind a license", () => {
		expect(INDEXING_MODEL_CONTROL_STATE).toEqual({
			description: "Select the embedding model to use for indexing",
			placeholder: "Select a model",
			disabled: false,
		})
	})
})
