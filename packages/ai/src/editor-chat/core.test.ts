import { describe, expect, it } from "vitest"
import { getEditorChatSystemPrompt, resolveEditorChatToolName } from "./core"
import {
	editSystemSelecting,
	generateSystemDefault,
	generateSystemSelecting,
} from "./prompts"

describe("resolveEditorChatToolName", () => {
	it("returns the requested tool when provided", () => {
		const result = resolveEditorChatToolName({
			requestedToolName: "generate",
			isSelecting: true,
		})

		expect(result).toBe("generate")
	})

	it("defaults to edit when selecting and tool is not specified", () => {
		const result = resolveEditorChatToolName({ isSelecting: true })

		expect(result).toBe("edit")
	})

	it("defaults to generate when not selecting and tool is not specified", () => {
		const result = resolveEditorChatToolName({ isSelecting: false })

		expect(result).toBe("generate")
	})
})

describe("getEditorChatSystemPrompt", () => {
	it("returns selecting generate system prompt", () => {
		const result = getEditorChatSystemPrompt({
			toolName: "generate",
			isSelecting: true,
		})

		expect(result).toBe(generateSystemSelecting)
	})

	it("returns default generate system prompt", () => {
		const result = getEditorChatSystemPrompt({
			toolName: "generate",
			isSelecting: false,
		})

		expect(result).toBe(generateSystemDefault)
	})

	it("returns selecting edit system prompt", () => {
		const result = getEditorChatSystemPrompt({
			toolName: "edit",
			isSelecting: true,
		})

		expect(result).toBe(editSystemSelecting)
	})

	it("throws for unsupported comment tool", () => {
		expect(() =>
			getEditorChatSystemPrompt({
				toolName: "comment",
				isSelecting: true,
			}),
		).toThrow("Unsupported tool: comment")
	})
})
