import { describe, expect, it } from "vitest"
import { getGraphDegradeProfile } from "./graph-utils"

describe("getGraphDegradeProfile", () => {
	it("uses the current small-graph label visibility threshold", () => {
		expect(getGraphDegradeProfile(100, 200)).toMatchObject({
			isDegraded: false,
			labelVisibleScale: 0.95,
		})
	})
})
