import { LinkPlugin } from "@platejs/link/react"
import { createPlatePlugin } from "platejs/react"
import type { AnchorHTMLAttributes } from "react"
import { exitLinkForwardAtSelection } from "../link/link-exit"
import {
	createLinkLeafDefaultAttributes,
	LinkFloatingToolbar,
} from "../link/link-toolbar"
import { LinkElement } from "../link/node-link"
import type {
	LinkIndexingConfig,
	LinkWorkspaceState,
	ResolveWikiLinkParams,
	ResolveWikiLinkResult,
	WorkspaceFileOption,
} from "./link-kit-types"

export type {
	LinkIndexingConfig,
	LinkWorkspaceEntry,
	LinkWorkspaceState,
	ResolveWikiLinkParams,
	ResolveWikiLinkResult,
	WorkspaceFileOption,
} from "./link-kit-types"

export type LinkHostDeps = {
	openExternalLink: (href: string) => Promise<void> | void
	openTab: (
		path: string,
		skipHistory?: boolean,
		force?: boolean,
		options?: {
			allowCreate?: boolean
		},
	) => Promise<void> | void
	createNote: (
		directoryPath: string,
		options?: {
			initialName?: string
			initialContent?: string
			openTab?: boolean
		},
	) => Promise<string>
	resolveWikiLink: (
		params: ResolveWikiLinkParams,
	) => Promise<ResolveWikiLinkResult>
	getIndexingConfig?: (
		workspacePath: string | null,
	) => Promise<LinkIndexingConfig | null>
	getRelatedNotes?: (input: {
		workspacePath: string
		currentTabPath: string
		limit: number
	}) => Promise<WorkspaceFileOption[]>
}

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
	host,
	useWorkspaceState,
	getWorkspaceState,
}: {
	host: LinkHostDeps
	useWorkspaceState: () => LinkWorkspaceState
	getWorkspaceState: () => LinkWorkspaceState
}) => {
	const FloatingToolbar = () => {
		const workspaceState = useWorkspaceState()
		return <LinkFloatingToolbar host={host} workspaceState={workspaceState} />
	}

	const defaultLinkAttributes: LinkLeafAttributes =
		createLinkLeafDefaultAttributes(host, getWorkspaceState)
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
