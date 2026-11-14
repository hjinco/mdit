import type { EditorDropIndicator } from "./editor-drop-indicator.helpers"

export function EditorDropLine({
	indicator,
}: {
	indicator: EditorDropIndicator
}) {
	return (
		<div
			aria-hidden
			className="pointer-events-none fixed z-60 h-0.5 bg-blue-400 dark:bg-blue-600/80"
			style={{
				left: indicator.lineStyle.left,
				top: indicator.lineStyle.top,
				width: indicator.lineStyle.width,
				transform: "translateY(-50%)",
			}}
		/>
	)
}
