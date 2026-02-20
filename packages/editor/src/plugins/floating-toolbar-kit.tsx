import { createPlatePlugin } from "platejs/react"
import { FloatingToolbar } from "../components/floating-toolbar"
import { FloatingToolbarButtons } from "../components/floating-toolbar-buttons"

export const FloatingToolbarKit = [
	createPlatePlugin({
		key: "floating-toolbar",
		render: {
			afterEditable: () => (
				<FloatingToolbar>
					<FloatingToolbarButtons />
				</FloatingToolbar>
			),
		},
	}),
]
