import { describe, expect, it } from "vitest"
import { isNoteTitleContextMenuTarget } from "./block-context-menu"

describe("isNoteTitleContextMenuTarget", () => {
	it("returns true when the event target is inside the note title block", () => {
		expect(
			isNoteTitleContextMenuTarget({
				closest: (selector: string) =>
					selector === "[data-note-title-block='true']" ? {} : null,
			} as unknown as EventTarget),
		).toBe(true)
	})

	it("returns false for non-title targets", () => {
		expect(
			isNoteTitleContextMenuTarget({
				closest: () => null,
			} as unknown as EventTarget),
		).toBe(false)
	})
})
