import { PointApi } from "platejs"
import { createPlatePlugin } from "platejs/react"
import { createElement, memo } from "react"
import type { LinkWorkspaceState } from "../link/link-kit-types"
import { requestFrontmatterFocus } from "./frontmatter-focus"
import { FrontmatterElement } from "./node-frontmatter"

export const FRONTMATTER_KEY = "frontmatter"

export type FrontmatterHostDeps = {
	onOpenWikiLink?: (target: string) => void | Promise<void>
	getLinkWorkspaceState?: () => LinkWorkspaceState
	resolveWikiLinkTarget?: (
		rawTarget: string,
		fallbackTarget: string,
	) => Promise<string>
}

export type CreateFrontmatterKitOptions = {
	host?: FrontmatterHostDeps
}

export function createFrontmatterPlugin({
	host,
}: CreateFrontmatterKitOptions = {}) {
	const FrontmatterNode = memo(
		(props: Parameters<typeof FrontmatterElement>[0]) =>
			createElement(FrontmatterElement, {
				...props,
				onOpenWikiLink: host?.onOpenWikiLink,
				getLinkWorkspaceState: host?.getLinkWorkspaceState,
				resolveWikiLinkTarget: host?.resolveWikiLinkTarget,
			}),
		() => true,
	)

	return createPlatePlugin({
		key: FRONTMATTER_KEY,
		node: {
			component: FrontmatterNode,
			isElement: true,
			isVoid: true,
		},
		handlers: {
			onKeyDown: ({ editor, event }) => {
				if (event.defaultPrevented) return
				if (event.key !== "ArrowUp" && event.key !== "ArrowLeft") return

				const selection = editor.selection
				if (!selection) return

				if (!editor.api.isCollapsed()) return

				const blockEntry = editor.api.block()
				if (!blockEntry) return
				const [, path] = blockEntry
				if (path.length !== 1 || path[0] !== 1) return

				const start = editor.api.start(path)
				if (!start) return
				if (
					!PointApi.equals(selection.anchor, start) ||
					!PointApi.equals(selection.focus, start)
				)
					return

				const firstNode = editor.children[0]
				if (!firstNode || firstNode.type !== FRONTMATTER_KEY) return

				event.preventDefault()
				event.stopPropagation()
				requestFrontmatterFocus(editor.id, "addButton")
			},
		},
	})
}

export const frontmatterPlugin = createFrontmatterPlugin()

export const createFrontmatterKit = ({
	host,
}: CreateFrontmatterKitOptions = {}) => [createFrontmatterPlugin({ host })]

export const FrontmatterKit = createFrontmatterKit()
