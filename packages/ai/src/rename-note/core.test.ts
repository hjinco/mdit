import { describe, expect, it, vi } from "vitest"
import { createRenameNoteWithAICore } from "./core"

const chatConfig = {
	provider: "openai" as const,
	model: "gpt-4.1-mini",
	apiKey: "test-key",
}
const toolExecutionOptions = {} as any

describe("createRenameNoteWithAICore", () => {
	it("uses tools to rename in batch and resolves collisions deterministically", async () => {
		const core = createRenameNoteWithAICore({
			fileSystem: {
				readTextFile: vi
					.fn()
					.mockResolvedValueOnce("# alpha")
					.mockResolvedValueOnce("# beta"),
				readDir: vi
					.fn()
					.mockResolvedValue([
						{ name: "alpha.md" },
						{ name: "beta.md" },
						{ name: "plan.md" },
					]),
				exists: vi.fn().mockResolvedValue(false),
			},
			createModel: vi.fn().mockReturnValue("mock-model"),
			runAgent: async ({ tools }) => {
				await tools.list_targets.execute?.({}, toolExecutionOptions)
				await tools.list_sibling_notes.execute?.({}, toolExecutionOptions)
				await tools.read_note.execute?.(
					{
						path: "/ws/inbox/alpha.md",
					},
					toolExecutionOptions,
				)
				await tools.set_title.execute?.(
					{
						path: "/ws/inbox/alpha.md",
						title: "Plan",
					},
					toolExecutionOptions,
				)
				await tools.read_note.execute?.(
					{
						path: "/ws/inbox/beta.md",
					},
					toolExecutionOptions,
				)
				await tools.set_title.execute?.(
					{
						path: "/ws/inbox/beta.md",
						title: "Plan",
					},
					toolExecutionOptions,
				)

				const finishOutput = await tools.finish_rename.execute?.(
					{},
					toolExecutionOptions,
				)
				return {
					steps: [
						{
							toolResults: [
								{
									toolName: "finish_rename",
									output: finishOutput,
								},
							],
						},
					],
				}
			},
		})

		const result = await core.suggestRename({
			entries: [
				{ path: "/ws/inbox/alpha.md", name: "alpha.md", isDirectory: false },
				{ path: "/ws/inbox/beta.md", name: "beta.md", isDirectory: false },
			],
			chatConfig,
		})

		expect(result).toEqual({
			renamedCount: 2,
			unchangedCount: 0,
			failedCount: 0,
			dirPath: "/ws/inbox",
			operations: [
				{
					path: "/ws/inbox/alpha.md",
					status: "renamed",
					suggestedBaseName: "Plan",
					finalFileName: "Plan 1.md",
				},
				{
					path: "/ws/inbox/beta.md",
					status: "renamed",
					suggestedBaseName: "Plan",
					finalFileName: "Plan 2.md",
				},
			],
		})
	})

	it("marks entries as failed when suggestions are invalid", async () => {
		const core = createRenameNoteWithAICore({
			fileSystem: {
				readTextFile: vi.fn().mockResolvedValue("# note"),
				readDir: vi
					.fn()
					.mockResolvedValue([
						{ name: "a.md" },
						{ name: "b.md" },
						{ name: "c.md" },
					]),
				exists: vi.fn().mockResolvedValue(false),
			},
			createModel: vi.fn().mockReturnValue("mock-model"),
			runAgent: async ({ tools }) => {
				await tools.set_title.execute?.(
					{
						path: "/ws/inbox/a.md",
						title: "Valid Name",
					},
					toolExecutionOptions,
				)
				await tools.set_title.execute?.(
					{
						path: "/ws/inbox/b.md",
						title: '/\\:*?"<>|',
					},
					toolExecutionOptions,
				)
				await tools.set_title.execute?.(
					{
						path: "/ws/inbox/c.md",
						title: "Project C",
					},
					toolExecutionOptions,
				)
				const finishOutput = await tools.finish_rename.execute?.(
					{},
					toolExecutionOptions,
				)
				return {
					steps: [
						{
							toolResults: [
								{
									toolName: "finish_rename",
									output: finishOutput,
								},
							],
						},
					],
				}
			},
		})

		const result = await core.suggestRename({
			entries: [
				{ path: "/ws/inbox/a.md", name: "a.md", isDirectory: false },
				{ path: "/ws/inbox/b.md", name: "b.md", isDirectory: false },
				{ path: "/ws/inbox/c.md", name: "c.md", isDirectory: false },
			],
			chatConfig,
		})

		expect(result).toEqual({
			renamedCount: 2,
			unchangedCount: 0,
			failedCount: 1,
			dirPath: "/ws/inbox",
			operations: [
				{
					path: "/ws/inbox/a.md",
					status: "renamed",
					suggestedBaseName: "Valid Name",
					finalFileName: "Valid Name.md",
				},
				{
					path: "/ws/inbox/b.md",
					status: "failed",
					reason: "The AI returned an invalid title.",
				},
				{
					path: "/ws/inbox/c.md",
					status: "renamed",
					suggestedBaseName: "Project C",
					finalFileName: "Project C.md",
				},
			],
		})
	})

	it("returns failed batch when agent ends without finish_rename success", async () => {
		const core = createRenameNoteWithAICore({
			fileSystem: {
				readTextFile: vi.fn().mockResolvedValue("# a"),
				readDir: vi.fn().mockResolvedValue([{ name: "a.md" }]),
				exists: vi.fn().mockResolvedValue(false),
			},
			createModel: vi.fn().mockReturnValue("mock-model"),
			runAgent: async () => ({
				steps: [],
			}),
		})

		const result = await core.suggestRename({
			entries: [{ path: "/ws/inbox/a.md", name: "a.md", isDirectory: false }],
			chatConfig,
		})

		expect(result).toEqual({
			renamedCount: 0,
			unchangedCount: 0,
			failedCount: 1,
			dirPath: "/ws/inbox",
			operations: [
				{
					path: "/ws/inbox/a.md",
					status: "failed",
					reason: "Agent finished without successful finish_rename.",
				},
			],
		})
	})

	it("returns failed batch when agent throws", async () => {
		const core = createRenameNoteWithAICore({
			fileSystem: {
				readTextFile: vi.fn().mockResolvedValue("# a"),
				readDir: vi.fn().mockResolvedValue([{ name: "a.md" }]),
				exists: vi.fn().mockResolvedValue(false),
			},
			createModel: vi.fn().mockReturnValue("mock-model"),
			runAgent: async () => {
				throw new Error("agent failed")
			},
		})

		const result = await core.suggestRename({
			entries: [{ path: "/ws/inbox/a.md", name: "a.md", isDirectory: false }],
			chatConfig,
		})

		expect(result).toEqual({
			renamedCount: 0,
			unchangedCount: 0,
			failedCount: 1,
			dirPath: "/ws/inbox",
			operations: [
				{
					path: "/ws/inbox/a.md",
					status: "failed",
					reason: "agent failed",
				},
			],
		})
	})

	it("throws when entries span multiple folders", async () => {
		const core = createRenameNoteWithAICore({
			fileSystem: {
				readTextFile: vi.fn().mockResolvedValue("# note"),
				readDir: vi.fn().mockResolvedValue([]),
				exists: vi.fn().mockResolvedValue(false),
			},
			createModel: vi.fn().mockReturnValue("mock-model"),
			runAgent: async () => ({
				steps: [],
			}),
		})

		await expect(
			core.suggestRename({
				entries: [
					{ path: "/ws/a/one.md", name: "one.md", isDirectory: false },
					{ path: "/ws/b/two.md", name: "two.md", isDirectory: false },
				],
				chatConfig,
			}),
		).rejects.toThrow("same folder")
	})
})
