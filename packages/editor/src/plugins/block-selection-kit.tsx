import { BlockMenuPlugin, BlockSelectionPlugin } from "@platejs/selection/react"
import { getPluginTypes, KEYS } from "platejs"
import type { PlateElementProps } from "platejs/react"
import { BlockContextMenu } from "../components/block-context-menu"
import { BlockSelectionAfterEditable } from "../components/block-seleciton-after-editable"
import { BlockSelection } from "../components/block-selection"
import type { CreateLinkedNotesFromListItemsHandler } from "./block-selection-linked-notes"
import { FRONTMATTER_KEY } from "./frontmatter-kit"

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
