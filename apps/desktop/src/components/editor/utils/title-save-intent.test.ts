import { describe, expect, it } from "vitest"
import { resolveTitleSaveIntent } from "./title-save-intent"

describe("resolveTitleSaveIntent", () => {
	const initial = { baseline: "Original", lastRequested: "" }

	it("keeps a filename changed by the file explorer when only the body was edited", () => {
		expect(
			resolveTitleSaveIntent(initial, "Original", "/notes/External.md"),
		).toEqual(initial)
	})

	it("saves a newer title typed while an older rename was running", () => {
		const pending = resolveTitleSaveIntent(
			initial,
			"First",
			"/notes/Original.md",
		)
		expect(
			resolveTitleSaveIntent(pending, "Original", "/notes/First.md"),
		).toEqual({ baseline: "First", lastRequested: "Original" })
	})

	it("keeps requesting a title while its rename has not succeeded", () => {
		const path = "/notes/Original.md"
		const pending = resolveTitleSaveIntent(initial, "New title", path)
		expect(resolveTitleSaveIntent(pending, "New title", path)).toEqual(pending)
	})
})
