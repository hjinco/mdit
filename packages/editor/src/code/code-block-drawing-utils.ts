import { NodeApi, type TCodeBlockElement } from "platejs"
import { CODE_DRAWING_KEY } from "./code-drawing-kit"

export const MERMAID_CODE_BLOCK_LANGUAGE = "mermaid"

export function isMermaidCodeBlockLanguage(lang: string): boolean {
	return lang.trim().toLowerCase() === MERMAID_CODE_BLOCK_LANGUAGE
}

export function getCodeBlockText(
	codeBlock: Pick<TCodeBlockElement, "children">,
): string {
	if (!Array.isArray(codeBlock.children)) {
		return ""
	}

	return codeBlock.children
		.map((child) => NodeApi.string(child as any))
		.join("\n")
}

export function createCodeDrawingNodeFromCodeBlock(
	codeBlock: Pick<TCodeBlockElement, "children">,
) {
	return {
		type: CODE_DRAWING_KEY,
		data: {
			code: getCodeBlockText(codeBlock),
			drawingMode: "Both",
			drawingType: "Mermaid",
		},
		children: [{ text: "" }],
	}
}
