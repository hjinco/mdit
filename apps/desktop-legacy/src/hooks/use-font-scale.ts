import { useEffect } from "react"
import { useWindowState } from "@/state"

/**
 * Syncs the current font scale to the root CSS variable.
 */
export function useFontScale() {
	const fontScale = useWindowState((s) => s.fontScale)

	useEffect(() => {
		document.documentElement.style.setProperty(
			"--font-scale",
			String(fontScale),
		)
	}, [fontScale])

	return fontScale
}
