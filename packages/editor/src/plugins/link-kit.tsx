import { LinkPlugin } from "@platejs/link/react"
import { KEYS, PathApi } from "platejs"
import { createPlatePlugin } from "platejs/react"
import type { AnchorHTMLAttributes, ComponentType } from "react"
import { LinkElement } from "../nodes/node-link"

type LinkLeafAttributes = Pick<
	AnchorHTMLAttributes<HTMLAnchorElement>,
	"onClick" | "onMouseDown"
>

const LinkExitPlugin = createPlatePlugin({
	key: "link-exit",
	shortcuts: {
		arrowRight: {
			keys: "arrowright",
			handler: ({ editor, event }) => {
				if (event.isComposing) return false

				const selection = editor.selection
				if (!selection || !editor.api.isCollapsed()) return false

				const linkType = editor.getType(KEYS.link)
				const linkEntry = editor.api.above({
					at: selection.anchor,
					match: { type: linkType },
				})
				if (!linkEntry) return false

				const [, path] = linkEntry
				if (!editor.api.isEnd(selection.focus, path)) return false

				const nextStart = editor.api.start(path, { next: true })
				if (nextStart) {
					editor.tf.select({ anchor: nextStart, focus: nextStart })
				} else {
					const nextPath = PathApi.next(path)
					editor.tf.insertNodes({ text: "" }, { at: nextPath })
					editor.tf.select(nextPath)
				}
				editor.tf.insertText(" ")
				return true
			},
		},
	},
})

export const createLinkKit = ({
	LinkFloatingToolbar,
	defaultLinkAttributes,
}: {
	LinkFloatingToolbar: ComponentType
	defaultLinkAttributes?: LinkLeafAttributes
}) => {
	return [
		LinkExitPlugin,
		LinkPlugin.configure({
			options: {
				defaultLinkAttributes:
					defaultLinkAttributes as AnchorHTMLAttributes<HTMLAnchorElement>,
			},
			render: {
				node: (props) => (
					<LinkElement
						{...props}
						defaultLinkAttributes={defaultLinkAttributes}
					/>
				),
				afterEditable: () => <LinkFloatingToolbar />,
			},
		}),
	]
}
