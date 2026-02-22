import { LinkPlugin } from "@platejs/link/react"
import type { AnchorHTMLAttributes, ComponentType } from "react"
import { LinkElement } from "../nodes/node-link"

type LinkLeafAttributes = Pick<
	AnchorHTMLAttributes<HTMLAnchorElement>,
	"onClick" | "onMouseDown"
>

export const createLinkKit = ({
	LinkFloatingToolbar,
	defaultLinkAttributes,
}: {
	LinkFloatingToolbar: ComponentType
	defaultLinkAttributes?: LinkLeafAttributes
}) => {
	return [
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
