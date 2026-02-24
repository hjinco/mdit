import { CodeDrawingPlugin } from "@platejs/code-drawing/react"
import { CodeDrawingElement } from "../nodes/node-code-drawing"

/** Plugin key for code drawing block (Mermaid, PlantUML, Graphviz, Flowchart) */
export const CODE_DRAWING_KEY = "code_drawing"

export const CodeDrawingKit = [
	CodeDrawingPlugin.extend({
		key: CODE_DRAWING_KEY,
		node: {
			type: CODE_DRAWING_KEY,
		},
	}).withComponent(CodeDrawingElement),
]
