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
	workspacePath?: string
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
	const operationByPath = createOperationByPath(entriesToProcess)

	return createMoveNoteTools({
		fileSystem: {
			readTextFile:
				params?.readTextFile ??
				vi.fn().mockResolvedValue("# Test note content"),
			moveEntry: params?.moveEntry ?? vi.fn().mockResolvedValue(true),
		},
		workspacePath: params?.workspacePath ?? "/ws",
		entriesToProcess,
		candidateDirectories,
		entryPathSet,
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
					destinationDir: "inbox",
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
					destinationDir: "forbidden",
				},
				toolExecutionOptions,
			),
		).rejects.toThrow(
			"move_note destinationDir is not in candidate directories.",
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
				destinationDir: "projects",
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
				destinationDir: "projects",
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

	it("resolves '.' to the workspace root for unchanged moves", async () => {
		const tools = setupTools({
			entriesToProcess: [
				{
					path: "/ws/todo.md",
					name: "todo.md",
					isDirectory: false,
				},
			],
			candidateDirectories: ["/ws", "/ws/projects"],
		})

		const result = await tools.move_note.execute?.(
			{
				sourcePath: "/ws/todo.md",
				destinationDir: ".",
			},
			toolExecutionOptions,
		)

		expect(result).toEqual({
			path: "/ws/todo.md",
			status: "unchanged",
			destinationDirPath: "/ws",
		})
	})

	it("lists workspace-relative directory forms for fallback verification", async () => {
		const tools = setupTools({
			candidateDirectories: ["/ws", "/ws/inbox", "/ws/projects"],
		})

		const result = await tools.list_directories.execute?.(
			{},
			toolExecutionOptions,
		)

		expect(result).toEqual({
			directories: [".", "inbox", "projects"],
		})
	})

	it("maps relative destinations back to the original Windows candidate path", async () => {
		const moveEntry = vi.fn().mockResolvedValue(true)
		const tools = setupTools({
			workspacePath: "C:\\ws",
			entriesToProcess: [
				{
					path: "C:/ws/inbox/todo.md",
					name: "todo.md",
					isDirectory: false,
				},
			],
			candidateDirectories: ["C:\\ws", "C:\\ws\\projects"],
			moveEntry,
		})

		const result = await tools.move_note.execute?.(
			{
				sourcePath: "C:/ws/inbox/todo.md",
				destinationDir: "projects",
			},
			toolExecutionOptions,
		)

		expect(result).toEqual({
			path: "C:/ws/inbox/todo.md",
			status: "moved",
			destinationDirPath: "C:\\ws\\projects",
		})
		expect(moveEntry).toHaveBeenCalledWith(
			"C:/ws/inbox/todo.md",
			"C:\\ws\\projects",
			expect.objectContaining({
				onConflict: "auto-rename",
				allowLockedSourcePath: true,
			}),
		)
	})

	it("accepts current-directory-prefixed relative destinations", async () => {
		const tools = setupTools({
			candidateDirectories: ["/ws", "/ws/inbox", "/ws/projects"],
		})

		const result = await tools.move_note.execute?.(
			{
				sourcePath: "/ws/inbox/todo.md",
				destinationDir: "./projects",
			},
			toolExecutionOptions,
		)

		expect(result).toEqual({
			path: "/ws/inbox/todo.md",
			status: "moved",
			destinationDirPath: "/ws/projects",
		})
	})
})
