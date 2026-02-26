import { describe, expect, it, vi } from "vitest"
import { MAX_NOTE_CONTEXT_LENGTH } from "./constants"
import { createOperationByPath, toPublicOperation } from "./operations"
import { createRenameNoteTools } from "./tools"
import type { RenameNoteWithAIEntry } from "./types"

const toolExecutionOptions = {} as any

function setupTools(params?: {
	readTextFile?: (path: string) => Promise<string>
	exists?: (path: string) => Promise<boolean>
	entriesToProcess?: RenameNoteWithAIEntry[]
	dirEntries?: Array<{ name?: string | null }>
}) {
	const entriesToProcess =
		params?.entriesToProcess ??
		([
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
		] satisfies RenameNoteWithAIEntry[])
	const operationByPath = createOperationByPath(entriesToProcess)
	const suggestionByPath = new Map<string, string>()

	const tools = createRenameNoteTools({
		fileSystem: {
			readTextFile:
				params?.readTextFile ??
				vi.fn().mockResolvedValue("# Default note content"),
			readDir: vi.fn(),
			exists: params?.exists ?? vi.fn().mockResolvedValue(false),
		},
		entriesToProcess,
		dirPath: "/ws/inbox",
		dirEntries: params?.dirEntries ?? [
			{ name: "a.md" },
			{ name: "b.md" },
			{ name: "plan.md" },
		],
		siblingNoteNames: ["plan"],
		entryPathSet: new Set(entriesToProcess.map((entry) => entry.path)),
		operationByPath,
		suggestionByPath,
	})

	return {
		tools,
		operationByPath,
	}
}

describe("createRenameNoteTools", () => {
	it("truncates read_note content by MAX_NOTE_CONTEXT_LENGTH", async () => {
		const longContent = "a".repeat(MAX_NOTE_CONTEXT_LENGTH + 10)
		const { tools } = setupTools({
			readTextFile: vi.fn().mockResolvedValue(longContent),
		})

		const result = await tools.read_note.execute?.(
			{
				path: "/ws/inbox/a.md",
			},
			toolExecutionOptions,
		)

		expect(result).toEqual({
			path: "/ws/inbox/a.md",
			content: `${"a".repeat(MAX_NOTE_CONTEXT_LENGTH)}\n...`,
		})
	})

	it("rejects set_title when target path is outside target list", async () => {
		const { tools } = setupTools()

		await expect(
			tools.set_title.execute?.(
				{
					path: "/ws/unknown.md",
					title: "Unknown",
				},
				toolExecutionOptions,
			),
		).rejects.toThrow("set_title path is not in target list.")
	})

	it("returns pending targets until all entries receive set_title", async () => {
		const { tools, operationByPath } = setupTools()

		await tools.set_title.execute?.(
			{
				path: "/ws/inbox/b.md",
				title: "Beta",
			},
			toolExecutionOptions,
		)

		const firstFinish = await tools.finish_rename.execute?.(
			{},
			toolExecutionOptions,
		)
		expect(firstFinish).toEqual({
			success: false,
			pendingPaths: ["/ws/inbox/a.md"],
		})

		await tools.set_title.execute?.(
			{
				path: "/ws/inbox/a.md",
				title: "Alpha",
			},
			toolExecutionOptions,
		)
		const secondFinish = await tools.finish_rename.execute?.(
			{},
			toolExecutionOptions,
		)
		expect(secondFinish).toEqual({
			success: true,
			pendingPaths: [],
		})

		expect(toPublicOperation(operationByPath.get("/ws/inbox/a.md")!)).toEqual({
			path: "/ws/inbox/a.md",
			status: "renamed",
			suggestedBaseName: "Alpha",
			finalFileName: "Alpha.md",
		})
		expect(toPublicOperation(operationByPath.get("/ws/inbox/b.md")!)).toEqual({
			path: "/ws/inbox/b.md",
			status: "renamed",
			suggestedBaseName: "Beta",
			finalFileName: "Beta.md",
		})
	})

	it("resolves title collisions in target order regardless of set_title call order", async () => {
		const { tools, operationByPath } = setupTools()

		await tools.set_title.execute?.(
			{
				path: "/ws/inbox/b.md",
				title: "Plan",
			},
			toolExecutionOptions,
		)
		await tools.set_title.execute?.(
			{
				path: "/ws/inbox/a.md",
				title: "Plan",
			},
			toolExecutionOptions,
		)
		const finishResult = await tools.finish_rename.execute?.(
			{},
			toolExecutionOptions,
		)

		expect(finishResult).toEqual({
			success: true,
			pendingPaths: [],
		})
		expect(toPublicOperation(operationByPath.get("/ws/inbox/a.md")!)).toEqual({
			path: "/ws/inbox/a.md",
			status: "renamed",
			suggestedBaseName: "Plan",
			finalFileName: "Plan 1.md",
		})
		expect(toPublicOperation(operationByPath.get("/ws/inbox/b.md")!)).toEqual({
			path: "/ws/inbox/b.md",
			status: "renamed",
			suggestedBaseName: "Plan",
			finalFileName: "Plan 2.md",
		})
	})
})
