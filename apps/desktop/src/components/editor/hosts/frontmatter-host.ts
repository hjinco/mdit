import type { FrontmatterHostDeps } from "@mdit/editor/frontmatter"
import type { LinkHostDeps } from "@mdit/editor/link"
import {
	normalizeWikiTargetForDisplay,
	openEditorLink,
} from "@mdit/editor/link"
import type { TagHostDeps } from "@mdit/editor/tag"
import { createDesktopLinkHost } from "./link-host"
import { createDesktopTagHost } from "./tag-host"

type DesktopFrontmatterHostRuntimeDeps = {
	linkHost: LinkHostDeps
	tagHost: TagHostDeps
	onResolveWikiLinkError?: (error: unknown) => void
}

const defaultRuntimeDeps: DesktopFrontmatterHostRuntimeDeps = {
	linkHost: createDesktopLinkHost(),
	tagHost: createDesktopTagHost(),
	onResolveWikiLinkError: (error) => {
		console.warn(
			"Failed to resolve frontmatter wiki link via invoke; using fallback:",
			error,
		)
	},
}

export const createDesktopFrontmatterHost = (
	runtimeDeps: Partial<DesktopFrontmatterHostRuntimeDeps> = defaultRuntimeDeps,
): FrontmatterHostDeps => {
	const deps = {
		...defaultRuntimeDeps,
		...runtimeDeps,
	}

	return {
		onOpenWikiLink: (target) =>
			openEditorLink({
				href: target,
				wiki: true,
				wikiTarget: target,
				host: deps.linkHost,
				workspaceState: deps.linkHost.getWorkspaceState(),
			}),
		getLinkWorkspaceState: deps.linkHost.getWorkspaceState,
		resolveWikiLinkTarget: async (rawTarget, fallbackTarget) => {
			const workspaceState = deps.linkHost.getWorkspaceState()
			const workspacePath = workspaceState.workspacePath
			const currentTabPath = workspaceState.tab?.path ?? null
			if (!workspacePath) {
				return fallbackTarget
			}

			try {
				const resolved = await deps.linkHost.resolveWikiLink({
					workspacePath,
					currentNotePath: currentTabPath,
					rawTarget,
				})
				const canonicalTarget = normalizeWikiTargetForDisplay(
					resolved.canonicalTarget,
				)
				if (resolved.unresolved) {
					return fallbackTarget || canonicalTarget
				}
				return canonicalTarget || fallbackTarget
			} catch (error) {
				deps.onResolveWikiLinkError?.(error)
				return fallbackTarget
			}
		},
		onOpenTagSearch: deps.tagHost.openTagSearch,
	}
}

export const desktopFrontmatterHost = createDesktopFrontmatterHost()
