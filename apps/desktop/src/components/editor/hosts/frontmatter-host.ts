import type { FrontmatterHostDeps } from "@mdit/editor/frontmatter"
import {
	type LinkOpenServices,
	type LinkServices,
	normalizeWikiTargetForDisplay,
	openEditorLink,
} from "@mdit/editor/link"
import type { TagHostDeps } from "@mdit/editor/tag"
import { desktopLinkServices } from "./link-host"
import { createDesktopTagHost } from "./tag-host"

type DesktopFrontmatterHostRuntimeDeps = {
	linkServices: LinkOpenServices & Pick<LinkServices, "resolver">
	tagHost: TagHostDeps
	onResolveWikiLinkError?: (error: unknown) => void
}

const defaultRuntimeDeps: DesktopFrontmatterHostRuntimeDeps = {
	linkServices: desktopLinkServices,
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
				services: deps.linkServices,
			}),
		getLinkWorkspaceState: deps.linkServices.workspace.getSnapshot,
		resolveWikiLinkTarget: async (rawTarget, fallbackTarget) => {
			const workspaceState = deps.linkServices.workspace.getSnapshot()
			const workspacePath = workspaceState.workspacePath
			const currentTabPath = workspaceState.tab?.path ?? null
			if (!workspacePath || !deps.linkServices.resolver) {
				return fallbackTarget
			}

			try {
				const resolved = await deps.linkServices.resolver.resolveWikiLink({
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
