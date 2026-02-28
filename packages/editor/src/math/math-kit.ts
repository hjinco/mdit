import { EquationPlugin, InlineEquationPlugin } from "@platejs/math/react"
import { EquationElement, InlineEquationElement } from "../math/node-equation"

export const MathKit = [
	InlineEquationPlugin.withComponent(InlineEquationElement),
	EquationPlugin.withComponent(EquationElement),
]
