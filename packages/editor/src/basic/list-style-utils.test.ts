import { describe, expect, it } from "vitest"
import {
	resolveBulletedListStyleByIndent,
	resolveListStyleTypeByIndent,
} from "./list-style-utils"

describe("list-style-utils", () => {
	it("returns disc when indent is undefined", () => {
		expect(resolveBulletedListStyleByIndent()).toBe("disc")
	})

	it("maps indent depth styles in a repeating cycle", () => {
		expect(resolveBulletedListStyleByIndent(1)).toBe("disc")
		expect(resolveBulletedListStyleByIndent(2)).toBe("circle")
		expect(resolveBulletedListStyleByIndent(3)).toBe("square")
		expect(resolveBulletedListStyleByIndent(4)).toBe("disc")
		expect(resolveBulletedListStyleByIndent(5)).toBe("circle")
	})

	it("normalizes non-positive and invalid indents to disc", () => {
		expect(resolveBulletedListStyleByIndent(0)).toBe("disc")
		expect(resolveBulletedListStyleByIndent(-1)).toBe("disc")
		expect(resolveBulletedListStyleByIndent(Number.NaN)).toBe("disc")
	})

	it("keeps non-bulleted list styles unchanged", () => {
		expect(resolveListStyleTypeByIndent("decimal", 3)).toBe("decimal")
		expect(resolveListStyleTypeByIndent("todo", 3)).toBe("todo")
	})
})
