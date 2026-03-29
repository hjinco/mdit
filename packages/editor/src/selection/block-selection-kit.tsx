import { BlockMenuPlugin, BlockSelectionPlugin } from "@platejs/selection/react"
import { getPluginTypes, KEYS, type Path, type TElement } from "platejs"
import type { PlateEditor, PlateElementProps } from "platejs/react"
import type { ReactNode } from "react"
import { FRONTMATTER_KEY } from "../frontmatter"
import { BlockContextMenu } from "../selection/block-context-menu"
import { BlockSelectionAfterEditable } from "../selection/block-seleciton-after-editable"
import { BlockSelection } from "../selection/block-selection"
import type { CreateLinkedNotesFromListItemsHandler } from "./block-selection-linked-notes"

export type BlockSelectionHostDeps = {
	createLinkedNotesFromListItems?: CreateLinkedNotesFromListItemsHandler
}

export type BlockSelectionKitOptions = {
	host?: BlockSelectionHostDeps
}

export const createBlockSelectionKit = (
	options: BlockSelectionKitOptions = {},
) => [
	BlockSelectionPlugin.configure(({ editor }: { editor: PlateEditor }) => {
		return {
			options: {
				enableContextMenu: true,
				isSelectable: (element: TElement, _path: Path) => {
					return !getPluginTypes(editor, [
						KEYS.codeLine,
						KEYS.td,
						FRONTMATTER_KEY,
					]).includes(element.type)
				},
			},
			render: {
				belowRootNodes: (props) => {
					if (!props.attributes?.className?.includes("slate-selectable"))
						return null

					return <BlockSelection {...(props as unknown as PlateElementProps)} />
				},
				afterEditable: () => <BlockSelectionAfterEditable />,
			},
		}
	}),
	BlockMenuPlugin.configure({
		render: {
			aboveEditable: (props: { children?: ReactNode }) => (
				<BlockContextMenu
					onCreateLinkedNotesFromListItems={
						options.host?.createLinkedNotesFromListItems
					}
				>
					{props.children}
				</BlockContextMenu>
			),
		},
	}),
]

export const BlockSelectionKit = createBlockSelectionKit()
