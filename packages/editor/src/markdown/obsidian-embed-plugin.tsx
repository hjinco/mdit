import type { TElement } from "platejs"
import { createPlatePlugin, type PlateElementProps } from "platejs/react"

export const OBSIDIAN_EMBED_KEY = "obsidian_embed"

export type TObsidianEmbedElement = TElement & {
	type: typeof OBSIDIAN_EMBED_KEY
	embedTarget: string
	width?: number
	height?: number
}

function ObsidianEmbedElement(props: PlateElementProps<TObsidianEmbedElement>) {
	return (
		<span
			{...props.attributes}
			contentEditable={false}
			style={{ display: "none" }}
		>
			{props.children}
		</span>
	)
}

export const ObsidianEmbedPlugin = createPlatePlugin({
	key: OBSIDIAN_EMBED_KEY,
	node: {
		component: ObsidianEmbedElement,
		isElement: true,
		isInline: true,
		isVoid: true,
	},
})
