import { describe, expect, it } from "vitest"
import { countOperations, toPublicOperation } from "./operations"

describe("toPublicOperation", () => {
	it("throws for pending operations", () => {
		expect(() =>
			toPublicOperation({
				path: "/ws/inbox/todo.md",
				status: "pending",
				currentDirectoryPath: "/ws/inbox",
			}),
		).toThrow("Pending operation cannot be returned.")
	})

	it("serializes moved and failed states with optional fields", () => {
		expect(
			toPublicOperation({
				path: "/ws/inbox/todo.md",
				status: "moved",
				currentDirectoryPath: "/ws/inbox",
				destinationDirPath: "/ws/projects",
				newPath: "/ws/projects/todo (1).md",
			}),
		).toEqual({
			path: "/ws/inbox/todo.md",
			status: "moved",
			destinationDirPath: "/ws/projects",
			newPath: "/ws/projects/todo (1).md",
		})

		expect(
			toPublicOperation({
				path: "/ws/inbox/failed.md",
				status: "failed",
				currentDirectoryPath: "/ws/inbox",
				destinationDirPath: "/ws/projects",
				reason: "moveEntry returned false",
			}),
		).toEqual({
			path: "/ws/inbox/failed.md",
			status: "failed",
			destinationDirPath: "/ws/projects",
			reason: "moveEntry returned false",
		})
	})
})

describe("countOperations", () => {
	it("counts moved, unchanged, and failed operations", () => {
		const result = countOperations([
			{
				path: "/ws/a.md",
				status: "moved",
			},
			{
				path: "/ws/b.md",
				status: "unchanged",
			},
			{
				path: "/ws/c.md",
				status: "failed",
			},
		])

		expect(result).toEqual({
			movedCount: 1,
			unchangedCount: 1,
			failedCount: 1,
		})
	})
})
