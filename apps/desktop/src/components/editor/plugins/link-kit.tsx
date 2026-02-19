import { LinkPlugin } from "@platejs/link/react"
import { LinkFloatingToolbar } from "../ui/link-toolbar"
import { LinkElement } from "../ui/node-link"

export const LinkKit = [
	LinkPlugin.configure({
		render: {
			node: LinkElement,
			afterEditable: () => <LinkFloatingToolbar />,
		},
	}),
]
