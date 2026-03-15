import { useBlockSelected } from "@platejs/selection/react"
import type { PlateElementProps } from "platejs/react"

export const blockSelectionVariants =
	"pointer-events-none absolute inset-0 z-20 bg-brand/[.11] rounded"

export function BlockSelection(props: PlateElementProps) {
	const isBlockSelected = useBlockSelected(props.element.id as string)

	if (props.plugin.key === "tr" || props.plugin.key === "table") return null
	if (!isBlockSelected) return null

	return (
		<div
			className={blockSelectionVariants}
			data-slot="block-selection"
			contentEditable={false}
		/>
	)
}
