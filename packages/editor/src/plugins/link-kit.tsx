import { LinkPlugin } from "@platejs/link/react"
import type { ComponentType } from "react"
import { LinkElement } from "../nodes/node-link"

export const createLinkKit = ({
	LinkFloatingToolbar,
}: {
	LinkFloatingToolbar: ComponentType
}) => {
	return [
		LinkPlugin.configure({
			render: {
				node: LinkElement,
				afterEditable: () => <LinkFloatingToolbar />,
			},
		}),
	]
}
