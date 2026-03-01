import { describe, expect, it } from "vitest"
import { areFrontmatterRowsEqual } from "./frontmatter-row-equality"

describe("frontmatter-row-equality", () => {
	it("returns true for equivalent primitive rows", () => {
		expect(
			areFrontmatterRowsEqual(
				[{ id: "1", key: "title", type: "string", value: "hello" }],
				[{ id: "1", key: "title", type: "string", value: "hello" }],
			),
		).toBe(true)
	})

	it("returns false when date values differ", () => {
		expect(
			areFrontmatterRowsEqual(
				[
					{
						id: "1",
						key: "published",
						type: "date",
						value: new Date("2026-01-01"),
					},
				],
				[
					{
						id: "1",
						key: "published",
						type: "date",
						value: new Date("2026-01-02"),
					},
				],
			),
		).toBe(false)
	})

	it("returns true for equivalent nested array/object values", () => {
		expect(
			areFrontmatterRowsEqual(
				[
					{
						id: "1",
						key: "meta",
						type: "array",
						value: [{ slug: "a" }, ["b", "c"]],
					},
				],
				[
					{
						id: "1",
						key: "meta",
						type: "array",
						value: [{ slug: "a" }, ["b", "c"]],
					},
				],
			),
		).toBe(true)
	})

	it("returns true for equivalent cyclic values without stack overflow", () => {
		const leftCycle: Record<string, unknown> = { label: "same" }
		leftCycle.self = leftCycle

		const rightCycle: Record<string, unknown> = { label: "same" }
		rightCycle.self = rightCycle

		expect(
			areFrontmatterRowsEqual(
				[{ id: "1", key: "meta", type: "object", value: leftCycle }],
				[{ id: "1", key: "meta", type: "object", value: rightCycle }],
			),
		).toBe(true)
	})

	it("returns false for cyclic values with different nested data", () => {
		const leftCycle: Record<string, unknown> = { label: "left" }
		leftCycle.self = leftCycle

		const rightCycle: Record<string, unknown> = { label: "right" }
		rightCycle.self = rightCycle

		expect(
			areFrontmatterRowsEqual(
				[{ id: "1", key: "meta", type: "object", value: leftCycle }],
				[{ id: "1", key: "meta", type: "object", value: rightCycle }],
			),
		).toBe(false)
	})
})
