import { describe, expect, it } from "vitest"
import { collectEntriesToProcess } from "./entries"

describe("collectEntriesToProcess", () => {
	it("filters non-markdown targets and de-duplicates by path", () => {
		const result = collectEntriesToProcess([
			{
				path: "/ws/inbox/todo.md",
				name: "todo.md",
				isDirectory: false,
			},
			{
				path: "/ws/inbox",
				name: "inbox",
				isDirectory: true,
			},
			{
				path: "/ws/inbox/todo.md",
				name: "todo-duplicate.md",
				isDirectory: false,
			},
			{
				path: "/ws/inbox/readme.txt",
				name: "readme.txt",
				isDirectory: false,
			},
		])

		expect(result).toEqual([
			{
				path: "/ws/inbox/todo.md",
				name: "todo-duplicate.md",
				isDirectory: false,
			},
		])
	})
})
