import type { PlateElementProps } from "platejs/react"
import { PlateElement, useEditorRef } from "platejs/react"
import { useCallback, useRef } from "react"
import type { LinkWorkspaceState } from "../link/link-kit-types"
import {
	type FrontmatterResolveWikiLinkTargetHandler,
	FrontmatterTable,
	type FrontmatterWikiLinkHandler,
	type KVRow,
} from "./node-frontmatter-table"

export type FrontmatterRow = KVRow

export type TFrontmatterElement = {
	type: "frontmatter"
	data: KVRow[]
	children: [{ text: string }]
}

export function FrontmatterElement(
	props: PlateElementProps<TFrontmatterElement> & {
		onOpenWikiLink?: FrontmatterWikiLinkHandler
		getLinkWorkspaceState?: () => LinkWorkspaceState
		resolveWikiLinkTarget?: FrontmatterResolveWikiLinkTargetHandler
	},
) {
	const editor = useEditorRef()
	const element = props.element
	const elementRef = useRef<TFrontmatterElement>(element)
	elementRef.current = element

	const handleDataChange = useCallback(
		(nextRows: KVRow[]) => {
			const path = props.api.findPath(elementRef.current)
			if (!path) return

			if (nextRows.length === 0) {
				editor.tf.removeNodes({ at: path })
				requestAnimationFrame(() => {
					if (editor.children.length > 0) {
						editor.tf.select([0], { edge: "start" })
					}
					editor.tf.focus()
				})
				return
			}
			editor.tf.setNodes({ data: nextRows }, { at: path })
		},
		[editor, props.api],
	)

	return (
		<PlateElement {...props} className="mb-4">
			<div
				className="flex flex-col select-none text-muted-foreground overflow-x-auto p-0.5"
				contentEditable={false}
				onContextMenu={(e) => e.stopPropagation()}
			>
				<FrontmatterTable
					data={element.data}
					onChange={handleDataChange}
					onOpenWikiLink={props.onOpenWikiLink}
					getLinkWorkspaceState={props.getLinkWorkspaceState}
					resolveWikiLinkTarget={props.resolveWikiLinkTarget}
				/>
			</div>
		</PlateElement>
	)
}
