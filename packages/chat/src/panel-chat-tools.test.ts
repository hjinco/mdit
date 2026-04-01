import type { ToolExecutionOptions } from "ai"
import { describe, expect, it, vi } from "vitest"
import { createPanelChatTools } from "./panel-chat-tools"

const toolExecutionOptions = {
	toolCallId: "test",
	messages: [],
} satisfies ToolExecutionOptions

describe("createPanelChatTools", () => {
	it("returns error when there is no active document path", async () => {
		const tools = createPanelChatTools({
			getActiveDocumentPath: () => null,
			readTextFile: vi.fn(),
		})

		const result = await tools.read_active_document.execute?.(
			{},
			toolExecutionOptions,
		)

		expect(result).toEqual({
			path: null,
			content: null,
			error: "No active document tab.",
		})
		expect(tools.read_active_document).toBeDefined()
	})

	it("reads and returns content from the active path", async () => {
		const readTextFile = vi.fn().mockResolvedValue("# Hello")
		const tools = createPanelChatTools({
			getActiveDocumentPath: () => "/ws/note.md",
			readTextFile,
		})

		const result = await tools.read_active_document.execute?.(
			{},
			toolExecutionOptions,
		)

		expect(readTextFile).toHaveBeenCalledWith("/ws/note.md")
		expect(result).toEqual({
			path: "/ws/note.md",
			content: "# Hello",
			error: null,
		})
	})

	it("truncates long file content", async () => {
		const long = "x".repeat(5000)
		const tools = createPanelChatTools({
			getActiveDocumentPath: () => "/ws/long.md",
			readTextFile: vi.fn().mockResolvedValue(long),
		})

		const result = await tools.read_active_document.execute?.(
			{},
			toolExecutionOptions,
		)

		expect(result?.content).toHaveLength(4000 + "\n...".length)
		expect(result?.content?.endsWith("\n...")).toBe(true)
	})

	it("returns a structured error when reading active document fails", async () => {
		const tools = createPanelChatTools({
			getActiveDocumentPath: () => "/ws/protected.md",
			readTextFile: vi.fn().mockRejectedValue(new Error("Permission denied")),
		})

		const result = await tools.read_active_document.execute?.(
			{},
			toolExecutionOptions,
		)

		expect(result).toEqual({
			path: "/ws/protected.md",
			content: null,
			error: "Permission denied",
		})
	})
})
