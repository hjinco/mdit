import { describe, expect, it } from "vitest"
import {
	formatObsidianCalloutDirective,
	getObsidianCalloutEmoji,
	getObsidianCalloutLabel,
	getObsidianCalloutTypeByEmoji,
	normalizeObsidianCalloutData,
	normalizeObsidianCalloutType,
	OBSIDIAN_CALLOUT_TYPES,
	parseObsidianCalloutDirective,
} from "./obsidian-callout"

describe("obsidian callout helpers", () => {
	it("preserves exact supported types", () => {
		expect(normalizeObsidianCalloutType("faq")).toBe("faq")
		expect(normalizeObsidianCalloutType("important")).toBe("important")
	})

	it("falls back unsupported types to note", () => {
		expect(normalizeObsidianCalloutType("custom")).toBe("note")
		expect(getObsidianCalloutLabel("custom")).toBe("Note")
	})

	it("maps callout types and emojis one-to-one", () => {
		for (const { emoji, value } of OBSIDIAN_CALLOUT_TYPES) {
			expect(getObsidianCalloutEmoji(value)).toBe(emoji)
			expect(getObsidianCalloutTypeByEmoji(emoji)).toBe(value)
		}
		expect(getObsidianCalloutTypeByEmoji("🙂")).toBeUndefined()
	})

	it("normalizes shared callout node data", () => {
		expect(
			normalizeObsidianCalloutData({
				calloutTitle: "  Heads up  ",
				calloutType: "warning",
				defaultFolded: 1 as never,
				isFoldable: true,
			}),
		).toEqual({
			calloutTitle: "Heads up",
			calloutType: "warning",
			defaultFolded: true,
			icon: "⚠️",
			isFoldable: true,
		})
	})

	it("parses fold markers and custom titles", () => {
		expect(parseObsidianCalloutDirective("[!faq]- Hidden")).toEqual({
			rawType: "faq",
			calloutTitle: "Hidden",
			calloutType: "faq",
			defaultFolded: true,
			isFoldable: true,
		})
	})

	it("formats canonical directives", () => {
		expect(
			formatObsidianCalloutDirective({
				calloutTitle: "Heads up",
				calloutType: "faq",
				defaultFolded: false,
				isFoldable: true,
			}),
		).toBe("[!faq]+ Heads up")
	})
})
