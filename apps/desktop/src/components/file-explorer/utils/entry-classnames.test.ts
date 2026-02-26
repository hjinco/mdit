import { describe, expect, it } from "vitest"
import { getEntryButtonClassName } from "./entry-classnames"

describe("getEntryButtonClassName", () => {
	it("keeps selected style priority over active style", () => {
		const className = getEntryButtonClassName({
			isSelected: true,
			isActive: true,
		})

		expect(className).toContain("bg-background/80")
		expect(className).not.toContain("bg-background/60")
	})

	it("applies active style when selected is false", () => {
		const className = getEntryButtonClassName({
			isSelected: false,
			isActive: true,
		})

		expect(className).toContain("bg-background/60")
		expect(className).toContain("text-accent-foreground/95")
		expect(className).not.toContain("bg-background/80")
	})

	it("uses hover style when both selected and active are false", () => {
		const className = getEntryButtonClassName({
			isSelected: false,
			isActive: false,
		})

		expect(className).toContain("hover:bg-background/40")
		expect(className).toContain("group-hover:bg-background/40")
		expect(className).not.toContain("bg-background/80")
		expect(className).not.toContain("bg-background/60")
	})

	it("applies pulse when locked and not renaming", () => {
		const className = getEntryButtonClassName({
			isLocked: true,
			isRenaming: false,
		})

		expect(className).toContain("animate-pulse")
	})

	it("does not apply pulse while renaming even when locked", () => {
		const className = getEntryButtonClassName({
			isLocked: true,
			isRenaming: true,
		})

		expect(className).not.toContain("animate-pulse")
	})
})
