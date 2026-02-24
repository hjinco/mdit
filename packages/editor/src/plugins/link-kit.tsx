import { LinkPlugin } from "@platejs/link/react"
import { createPlatePlugin } from "platejs/react"
import type { AnchorHTMLAttributes, ComponentType } from "react"
import { LinkElement } from "../nodes/node-link"
import { exitLinkForwardAtSelection } from "../utils/link-exit"

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

				return exitLinkForwardAtSelection(editor, {
					allowFromInsideLink: false,
					focusEditor: true,
					markArrowRightExit: true,
				})
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
