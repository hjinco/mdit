import { describe, expect, it } from "vitest"
import {
	getEditorChatPromptTemplate,
	promptDefault,
	promptSelecting,
} from "./prompts"

describe("getEditorChatPromptTemplate", () => {
	it("returns the selecting prompt template", () => {
		const result = getEditorChatPromptTemplate(true)

		expect(result).toBe(promptSelecting)
	})

	it("returns the default prompt template", () => {
		const result = getEditorChatPromptTemplate(false)

		expect(result).toBe(promptDefault)
	})

	it("keeps required selection placeholders in the selecting template", () => {
		const result = getEditorChatPromptTemplate(true)

		expect(result).toContain("<Selection>")
		expect(result).toContain("<Block>")
		expect(result).toContain("{prompt} about <Selection>")
	})

	it("keeps required no-block reminder in the default template", () => {
		const result = getEditorChatPromptTemplate(false)

		expect(result).toContain("CRITICAL: NEVER write <Block>.")
	})
})
