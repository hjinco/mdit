import { LinkPlugin } from "@platejs/link/react"
import { createPlatePlugin } from "platejs/react"
import type { AnchorHTMLAttributes } from "react"
import { exitLinkForwardAtSelection } from "../link/link-exit"
import {
	createLinkLeafDefaultAttributes,
	LinkFloatingToolbar,
} from "../link/link-toolbar"
import { LinkElement } from "../link/node-link"
import type { LinkServices } from "./link-ports"

export type {
	LinkIndexingConfig,
	LinkWorkspaceEntry,
	LinkWorkspaceState,
	ResolveWikiLinkParams,
	ResolveWikiLinkResult,
	WorkspaceFileOption,
} from "./link-kit-types"

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

export const createLinkKit = ({ services }: { services: LinkServices }) => {
	const FloatingToolbar = () => {
		const workspaceState = services.workspace.useSnapshot()
		return (
			<LinkFloatingToolbar
				services={services}
				workspaceState={workspaceState}
			/>
		)
	}

	const defaultLinkAttributes: LinkLeafAttributes =
		createLinkLeafDefaultAttributes(services)

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
				afterEditable: FloatingToolbar,
			},
		}),
	]
}
