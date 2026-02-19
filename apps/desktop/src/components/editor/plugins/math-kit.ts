import { EquationPlugin, InlineEquationPlugin } from "@platejs/math/react"
import { EquationElement, InlineEquationElement } from "../ui/node-equation"

export const MathKit = [
	InlineEquationPlugin.withComponent(InlineEquationElement),
	EquationPlugin.withComponent(EquationElement),
]
