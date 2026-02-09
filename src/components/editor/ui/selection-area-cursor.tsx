import { BlockSelectionPlugin } from "@platejs/selection/react"
import { usePluginOption } from "platejs/react"
import { useEffect } from "react"

export function SelectionAreaCursor() {
	const isSelectionAreaVisible = usePluginOption(
		BlockSelectionPlugin,
		"isSelectionAreaVisible",
	)

	useEffect(() => {
		if (isSelectionAreaVisible) {
			document.body.style.cursor = "default"
		} else {
			document.body.style.cursor = ""
		}
	}, [isSelectionAreaVisible])

	return null
}
