import { describe, expect, it, vi } from "vitest"
import {
	countOperations,
	createOperationByPath,
	finalizeRenameOperations,
	toPublicOperation,
} from "./operations"
import type { RenameNoteWithAIEntry } from "./types"

describe("toPublicOperation", () => {
	it("throws for pending operations", () => {
		expect(() =>
			toPublicOperation({
				path: "/ws/inbox/todo.md",
				status: "pending",
			}),
		).toThrow("Pending operation cannot be returned.")
	})
})

describe("finalizeRenameOperations", () => {
	it("applies valid suggestion and marks invalid or missing suggestions as failed", async () => {
		const entriesToProcess = [
			{
				path: "/ws/inbox/a.md",
				name: "a.md",
				isDirectory: false,
			},
			{
				path: "/ws/inbox/b.md",
				name: "b.md",
				isDirectory: false,
			},
			{
				path: "/ws/inbox/c.md",
				name: "c.md",
				isDirectory: false,
			},
		] satisfies RenameNoteWithAIEntry[]
		const operationByPath = createOperationByPath(entriesToProcess)
		const suggestionByPath = new Map<string, string>([
			["/ws/inbox/a.md", "Valid Name"],
			["/ws/inbox/b.md", '/\\:*?"<>|'],
		])

		await finalizeRenameOperations({
			entriesToProcess,
			operationByPath,
			suggestionByPath,
			dirEntries: [{ name: "a.md" }, { name: "b.md" }, { name: "c.md" }],
			dirPath: "/ws/inbox",
			exists: vi.fn().mockResolvedValue(false),
		})

		expect(toPublicOperation(operationByPath.get("/ws/inbox/a.md")!)).toEqual({
			path: "/ws/inbox/a.md",
			status: "renamed",
			suggestedBaseName: "Valid Name",
			finalFileName: "Valid Name.md",
		})
		expect(toPublicOperation(operationByPath.get("/ws/inbox/b.md")!)).toEqual({
			path: "/ws/inbox/b.md",
			status: "failed",
			reason: "The AI returned an invalid title.",
		})
		expect(toPublicOperation(operationByPath.get("/ws/inbox/c.md")!)).toEqual({
			path: "/ws/inbox/c.md",
			status: "failed",
			reason: "No rename suggestion was returned for this note.",
		})
	})
})

describe("countOperations", () => {
	it("counts renamed, unchanged, and failed operations", () => {
		const result = countOperations([
			{
				path: "/ws/a.md",
				status: "renamed",
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
			renamedCount: 1,
			unchangedCount: 1,
			failedCount: 1,
		})
	})
})
