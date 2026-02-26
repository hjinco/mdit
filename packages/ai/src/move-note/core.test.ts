import { describe, expect, it, vi } from "vitest"
import { createMoveNoteWithAICore } from "./core"

const chatConfig = {
	provider: "openai" as const,
	model: "gpt-4.1-mini",
	apiKey: "test-key",
}
const toolExecutionOptions = {} as any

describe("createMoveNoteWithAICore", () => {
	it("organizes multiple notes and returns batch summary", async () => {
		const readTextFile = vi
			.fn()
			.mockResolvedValueOnce("# Project plan")
			.mockResolvedValueOnce("# Inbox task")
		const moveEntry = vi.fn().mockResolvedValue(true)

		const core = createMoveNoteWithAICore({
			fileSystem: { readTextFile, moveEntry },
			createModel: vi.fn().mockReturnValue("mock-model"),
			runAgent: async ({ tools }) => {
				await tools.list_targets.execute?.({}, toolExecutionOptions)
				await tools.list_directories.execute?.({}, toolExecutionOptions)
				await tools.read_note.execute?.(
					{
						path: "/ws/inbox/plan.md",
					},
					toolExecutionOptions,
				)
				await tools.move_note.execute?.(
					{
						sourcePath: "/ws/inbox/plan.md",
						destinationDirPath: "/ws/projects",
					},
					toolExecutionOptions,
				)
				await tools.read_note.execute?.(
					{
						path: "/ws/inbox/todo.md",
					},
					toolExecutionOptions,
				)
				await tools.move_note.execute?.(
					{
						sourcePath: "/ws/inbox/todo.md",
						destinationDirPath: "/ws/inbox",
					},
					toolExecutionOptions,
				)

				const finishOutput = await tools.finish_organization.execute?.(
					{},
					toolExecutionOptions,
				)
				return {
					steps: [
						{
							toolResults: [
								{
									toolName: "finish_organization",
									output: finishOutput,
								},
							],
						},
					],
				}
			},
		})

		const result = await core.organizeNotes({
			entries: [
				{
					path: "/ws/inbox/plan.md",
					name: "plan.md",
					isDirectory: false,
				},
				{
					path: "/ws/inbox/todo.md",
					name: "todo.md",
					isDirectory: false,
				},
			],
			workspacePath: "/ws",
			candidateDirectories: ["/ws", "/ws/inbox", "/ws/projects"],
			chatConfig,
		})

		expect(result).toEqual({
			movedCount: 1,
			unchangedCount: 1,
			failedCount: 0,
			operations: [
				{
					path: "/ws/inbox/plan.md",
					status: "moved",
					destinationDirPath: "/ws/projects",
				},
				{
					path: "/ws/inbox/todo.md",
					status: "unchanged",
					destinationDirPath: "/ws/inbox",
				},
			],
		})
		expect(moveEntry).toHaveBeenCalledTimes(1)
		expect(moveEntry).toHaveBeenCalledWith(
			"/ws/inbox/plan.md",
			"/ws/projects",
			expect.objectContaining({
				onConflict: "auto-rename",
				allowLockedSourcePath: true,
			}),
		)
		expect(readTextFile).toHaveBeenCalledWith("/ws/inbox/plan.md")
		expect(readTextFile).toHaveBeenCalledWith("/ws/inbox/todo.md")
	})

	it("fails when tool requests a destination outside candidate directories", async () => {
		const core = createMoveNoteWithAICore({
			fileSystem: {
				readTextFile: vi.fn().mockResolvedValue("# Note"),
				moveEntry: vi.fn().mockResolvedValue(true),
			},
			createModel: vi.fn().mockReturnValue("mock-model"),
			runAgent: async ({ tools }) => {
				await tools.move_note.execute?.(
					{
						sourcePath: "/ws/inbox/todo.md",
						destinationDirPath: "/ws/forbidden",
					},
					toolExecutionOptions,
				)
				return { steps: [] }
			},
		})

		await expect(
			core.organizeNotes({
				entries: [
					{
						path: "/ws/inbox/todo.md",
						name: "todo.md",
						isDirectory: false,
					},
				],
				workspacePath: "/ws",
				candidateDirectories: ["/ws", "/ws/inbox"],
				chatConfig,
			}),
		).rejects.toThrow("candidate directories")
	})

	it("fails when finish_organization succeeds before all entries are processed", async () => {
		const core = createMoveNoteWithAICore({
			fileSystem: {
				readTextFile: vi.fn().mockResolvedValue("# Note"),
				moveEntry: vi.fn().mockResolvedValue(true),
			},
			createModel: vi.fn().mockReturnValue("mock-model"),
			runAgent: async ({ tools }) => {
				const finishOutput = await tools.finish_organization.execute?.(
					{},
					toolExecutionOptions,
				)
				return {
					steps: [
						{
							toolResults: [
								{
									toolName: "finish_organization",
									output: finishOutput,
								},
							],
						},
					],
				}
			},
		})

		await expect(
			core.organizeNotes({
				entries: [
					{
						path: "/ws/inbox/todo.md",
						name: "todo.md",
						isDirectory: false,
					},
				],
				workspacePath: "/ws",
				candidateDirectories: ["/ws", "/ws/inbox"],
				chatConfig,
			}),
		).rejects.toThrow("successful finish_organization")
	})

	it("counts move failures from moveEntry return value", async () => {
		const moveEntry = vi.fn().mockResolvedValue(false)
		const core = createMoveNoteWithAICore({
			fileSystem: {
				readTextFile: vi.fn().mockResolvedValue("# Note"),
				moveEntry,
			},
			createModel: vi.fn().mockReturnValue("mock-model"),
			runAgent: async ({ tools }) => {
				await tools.move_note.execute?.(
					{
						sourcePath: "/ws/inbox/todo.md",
						destinationDirPath: "/ws/projects",
					},
					toolExecutionOptions,
				)
				const finishOutput = await tools.finish_organization.execute?.(
					{},
					toolExecutionOptions,
				)
				return {
					steps: [
						{
							toolResults: [
								{
									toolName: "finish_organization",
									output: finishOutput,
								},
							],
						},
					],
				}
			},
		})

		const result = await core.organizeNotes({
			entries: [
				{
					path: "/ws/inbox/todo.md",
					name: "todo.md",
					isDirectory: false,
				},
			],
			workspacePath: "/ws",
			candidateDirectories: ["/ws", "/ws/inbox", "/ws/projects"],
			chatConfig,
		})

		expect(result).toEqual({
			movedCount: 0,
			unchangedCount: 0,
			failedCount: 1,
			operations: [
				{
					path: "/ws/inbox/todo.md",
					status: "failed",
					destinationDirPath: "/ws/projects",
					reason: "moveEntry returned false",
				},
			],
		})
		expect(moveEntry).toHaveBeenCalledTimes(1)
	})
})
