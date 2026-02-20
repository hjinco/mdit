import { EquationPlugin, InlineEquationPlugin } from "@platejs/math/react"
import { EquationElement, InlineEquationElement } from "../nodes/node-equation"

export const MathKit = [
	InlineEquationPlugin.withComponent(InlineEquationElement),
	EquationPlugin.withComponent(EquationElement),
]
