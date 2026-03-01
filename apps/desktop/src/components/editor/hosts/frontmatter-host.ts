import type { FrontmatterHostDeps } from "@mdit/editor/frontmatter"
import type { LinkHostDeps } from "@mdit/editor/link"
import {
	normalizeWikiTargetForDisplay,
	openEditorLink,
} from "@mdit/editor/link"
import { createDesktopLinkHost } from "./link-host"

type DesktopFrontmatterHostRuntimeDeps = {
	linkHost: LinkHostDeps
	onResolveWikiLinkError?: (error: unknown) => void
}

const defaultRuntimeDeps: DesktopFrontmatterHostRuntimeDeps = {
	linkHost: createDesktopLinkHost(),
	onResolveWikiLinkError: (error) => {
		console.warn(
			"Failed to resolve frontmatter wiki link via invoke; using fallback:",
			error,
		)
	},
}

export const createDesktopFrontmatterHost = (
	runtimeDeps: DesktopFrontmatterHostRuntimeDeps = defaultRuntimeDeps,
): FrontmatterHostDeps => ({
	onOpenWikiLink: (target) =>
		openEditorLink({
			href: target,
			wiki: true,
			wikiTarget: target,
			host: runtimeDeps.linkHost,
			workspaceState: runtimeDeps.linkHost.getWorkspaceState(),
		}),
	getLinkWorkspaceState: runtimeDeps.linkHost.getWorkspaceState,
	resolveWikiLinkTarget: async (rawTarget, fallbackTarget) => {
		const workspaceState = runtimeDeps.linkHost.getWorkspaceState()
		const workspacePath = workspaceState.workspacePath
		const currentTabPath = workspaceState.tab?.path ?? null
		if (!workspacePath) {
			return fallbackTarget
		}

		try {
			const resolved = await runtimeDeps.linkHost.resolveWikiLink({
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
			runtimeDeps.onResolveWikiLinkError?.(error)
			return fallbackTarget
		}
	},
})

export const desktopFrontmatterHost = createDesktopFrontmatterHost()
