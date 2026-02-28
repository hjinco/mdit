import { BlockMenuPlugin, BlockSelectionPlugin } from "@platejs/selection/react"
import { getPluginTypes, KEYS } from "platejs"
import type { PlateElementProps } from "platejs/react"
import { FRONTMATTER_KEY } from "../frontmatter"
import { BlockContextMenu } from "../selection/block-context-menu"
import { BlockSelectionAfterEditable } from "../selection/block-seleciton-after-editable"
import { BlockSelection } from "../selection/block-selection"
import type { CreateLinkedNotesFromListItemsHandler } from "./block-selection-linked-notes"

export type BlockSelectionKitOptions = {
	onCreateLinkedNotesFromListItems?: CreateLinkedNotesFromListItemsHandler
}

export const createBlockSelectionKit = (
	options: BlockSelectionKitOptions = {},
) => [
	BlockSelectionPlugin.configure(({ editor }) => {
		return {
			options: {
				enableContextMenu: true,
				isSelectable: (element) => {
					return !getPluginTypes(editor, [
						KEYS.codeLine,
						KEYS.td,
						FRONTMATTER_KEY,
					]).includes(element.type)
				},
			},
			render: {
				belowRootNodes: (props) => {
					if (!props.attributes.className?.includes("slate-selectable"))
						return null

					return <BlockSelection {...(props as unknown as PlateElementProps)} />
				},
				afterEditable: () => <BlockSelectionAfterEditable />,
			},
		}
	}),
	BlockMenuPlugin.configure({
		render: {
			aboveEditable: (props) => (
				<BlockContextMenu
					onCreateLinkedNotesFromListItems={
						options.onCreateLinkedNotesFromListItems
					}
				>
					{props.children}
				</BlockContextMenu>
			),
		},
	}),
]

export const BlockSelectionKit = createBlockSelectionKit()
