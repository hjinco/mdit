import { describe, expect, it } from "vitest"
import {
	createCodeDrawingNodeFromCodeBlock,
	getCodeBlockText,
	isMermaidCodeBlockLanguage,
} from "./code-block-drawing-utils"
import { CODE_DRAWING_KEY } from "./code-drawing-kit"

describe("code-block-drawing-utils", () => {
	it("detects the Mermaid code block language case-insensitively", () => {
		expect(isMermaidCodeBlockLanguage("mermaid")).toBe(true)
		expect(isMermaidCodeBlockLanguage(" Mermaid ")).toBe(true)
		expect(isMermaidCodeBlockLanguage("plantuml")).toBe(false)
	})

	it("joins code block lines into a single code string", () => {
		const code = getCodeBlockText({
			children: [
				{ type: "code_line", children: [{ text: "flowchart TD" }] },
				{ type: "code_line", children: [{ text: "  A --> B" }] },
			],
		} as any)

		expect(code).toBe("flowchart TD\n  A --> B")
	})

	it("creates a Mermaid code drawing node from a code block", () => {
		const node = createCodeDrawingNodeFromCodeBlock({
			children: [
				{ type: "code_line", children: [{ text: "sequenceDiagram" }] },
				{ type: "code_line", children: [{ text: "  Alice->>Bob: Hello" }] },
			],
		} as any)

		expect(node).toEqual({
			type: CODE_DRAWING_KEY,
			data: {
				code: "sequenceDiagram\n  Alice->>Bob: Hello",
				drawingMode: "Both",
				drawingType: "Mermaid",
			},
			children: [{ text: "" }],
		})
	})
})
