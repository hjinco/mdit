import { describe, expect, it, vi } from "vitest"
import { MAX_MOVE_NOTE_CONTEXT_LENGTH } from "./constants"
import { createOperationByPath } from "./operations"
import { createMoveNoteTools } from "./tools"
import type { MoveNoteWithAIEntry } from "./types"

const toolExecutionOptions = {} as any

function setupTools(params?: {
	readTextFile?: (path: string) => Promise<string>
	moveEntry?: (
		sourcePath: string,
		destinationPath: string,
		options?: {
			onConflict?: "fail" | "auto-rename"
			allowLockedSourcePath?: boolean
			onMoved?: (newPath: string) => void
		},
	) => Promise<boolean>
	entriesToProcess?: MoveNoteWithAIEntry[]
	candidateDirectories?: string[]
}) {
	const entriesToProcess =
		params?.entriesToProcess ??
		([
			{
				path: "/ws/inbox/todo.md",
				name: "todo.md",
				isDirectory: false,
			},
		] satisfies MoveNoteWithAIEntry[])
	const candidateDirectories = params?.candidateDirectories ?? [
		"/ws",
		"/ws/inbox",
	]
	const entryPathSet = new Set(entriesToProcess.map((entry) => entry.path))
	const candidateDirectorySet = new Set(candidateDirectories)
	const operationByPath = createOperationByPath(entriesToProcess)

	return createMoveNoteTools({
		fileSystem: {
			readTextFile:
				params?.readTextFile ??
				vi.fn().mockResolvedValue("# Test note content"),
			moveEntry: params?.moveEntry ?? vi.fn().mockResolvedValue(true),
		},
		entriesToProcess,
		candidateDirectories,
		entryPathSet,
		candidateDirectorySet,
		operationByPath,
	})
}

describe("createMoveNoteTools", () => {
	it("truncates read_note content by MAX_MOVE_NOTE_CONTEXT_LENGTH", async () => {
		const longContent = "a".repeat(MAX_MOVE_NOTE_CONTEXT_LENGTH + 10)
		const tools = setupTools({
			readTextFile: vi.fn().mockResolvedValue(longContent),
		})

		const result = await tools.read_note.execute?.(
			{
				path: "/ws/inbox/todo.md",
			},
			toolExecutionOptions,
		)

		expect(result).toEqual({
			path: "/ws/inbox/todo.md",
			content: `${"a".repeat(MAX_MOVE_NOTE_CONTEXT_LENGTH)}\n...`,
		})
	})

	it("rejects move_note when source path is not a target", async () => {
		const tools = setupTools()

		await expect(
			tools.move_note.execute?.(
				{
					sourcePath: "/ws/unknown.md",
					destinationDirPath: "/ws/inbox",
				},
				toolExecutionOptions,
			),
		).rejects.toThrow("move_note sourcePath is not in target list.")
	})

	it("rejects move_note when destination directory is outside candidates", async () => {
		const tools = setupTools()

		await expect(
			tools.move_note.execute?.(
				{
					sourcePath: "/ws/inbox/todo.md",
					destinationDirPath: "/ws/forbidden",
				},
				toolExecutionOptions,
			),
		).rejects.toThrow(
			"move_note destinationDirPath is not in candidate directories.",
		)
	})

	it("returns failed operation with reason when moveEntry returns false", async () => {
		const tools = setupTools({
			candidateDirectories: ["/ws", "/ws/inbox", "/ws/projects"],
			moveEntry: vi.fn().mockResolvedValue(false),
		})

		const result = await tools.move_note.execute?.(
			{
				sourcePath: "/ws/inbox/todo.md",
				destinationDirPath: "/ws/projects",
			},
			toolExecutionOptions,
		)

		expect(result).toEqual({
			path: "/ws/inbox/todo.md",
			status: "failed",
			destinationDirPath: "/ws/projects",
			reason: "moveEntry returned false",
		})
	})

	it("stores newPath from moveEntry callback when move succeeds", async () => {
		const tools = setupTools({
			candidateDirectories: ["/ws", "/ws/inbox", "/ws/projects"],
			moveEntry: vi.fn().mockImplementation(
				async (
					_sourcePath: string,
					_destinationPath: string,
					options?: {
						onConflict?: "fail" | "auto-rename"
						allowLockedSourcePath?: boolean
						onMoved?: (newPath: string) => void
					},
				) => {
					options?.onMoved?.("/ws/projects/todo (1).md")
					return true
				},
			),
		})

		const result = await tools.move_note.execute?.(
			{
				sourcePath: "/ws/inbox/todo.md",
				destinationDirPath: "/ws/projects",
			},
			toolExecutionOptions,
		)

		expect(result).toEqual({
			path: "/ws/inbox/todo.md",
			status: "moved",
			destinationDirPath: "/ws/projects",
			newPath: "/ws/projects/todo (1).md",
		})
	})
})
