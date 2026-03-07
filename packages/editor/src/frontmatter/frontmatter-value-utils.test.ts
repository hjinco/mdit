import { describe, expect, it } from "vitest"
import { convertValueToType } from "./frontmatter-value-utils"

describe("convertValueToType", () => {
	it("normalizes tag strings into a trimmed yaml-safe list", () => {
		expect(convertValueToType("#Project, Area/Sub, , #Docs", "tags")).toEqual([
			"Project",
			"Area/Sub",
			"Docs",
		])
	})

	it("normalizes tag arrays while preserving case", () => {
		expect(
			convertValueToType(["#Project/Docs", " Area ", "", 3], "tags"),
		).toEqual(["Project/Docs", "Area", "3"])
	})
})
