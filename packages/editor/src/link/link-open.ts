import { join, dirname as pathDirname, resolve } from "pathe"
import type { LinkHostDeps, LinkWorkspaceState } from "../link/link-kit"
import {
	flattenWorkspaceFiles,
	isPathInsideWorkspaceRoot,
	parseInternalLinkTarget,
	resolveInternalLinkPath,
	safelyDecodeUrl,
	stripLeadingSlashes,
} from "../link/link-toolbar-utils"
import { startsWithHttpProtocol } from "./link-utils"

export type OpenEditorLinkOptions = {
	href: string
	wiki?: boolean
	wikiTarget?: string
	host: LinkHostDeps
	workspaceState: LinkWorkspaceState
}

export async function openEditorLink(options: OpenEditorLinkOptions) {
	const decodedUrl = options.href ? safelyDecodeUrl(options.href) : ""
	const targetUrl = decodedUrl || options.href
	if (!targetUrl) {
		return
	}

	const isWebLink = startsWithHttpProtocol(targetUrl)
	if (isWebLink) {
		try {
			await options.host.openExternalLink(targetUrl)
		} catch (error) {
			console.error("Failed to open external link:", error)
		}
		return
	}

	if (targetUrl.startsWith("#")) {
		// TODO: handle anchor links
		return
	}

	const {
		entries: workspaceEntries,
		tab: currentTab,
		workspacePath,
	} = options.workspaceState
	const { openTab } = options.host

	try {
		if (!workspacePath) {
			return
		}

		const workspaceFiles = flattenWorkspaceFiles(
			workspaceEntries,
			workspacePath,
		)
		const isWikiLink = Boolean(options.wiki || options.wikiTarget)
		const rawTarget = options.wikiTarget || targetUrl

		if (isWikiLink) {
			try {
				const resolved = await options.host.resolveWikiLink({
					workspacePath,
					currentNotePath: currentTab?.path ?? null,
					rawTarget,
				})
				if (resolved.resolvedRelPath) {
					const absoluteResolved = resolve(
						workspacePath,
						resolved.resolvedRelPath,
					)
					if (!isPathInsideWorkspaceRoot(absoluteResolved, workspacePath)) {
						console.warn(
							"Workspace link outside of root blocked:",
							absoluteResolved,
						)
						return
					}
					await openTab(absoluteResolved)
				}
				return
			} catch (error) {
				console.warn(
					"Failed to resolve wiki link via invoke while opening; using fallback:",
					error,
				)
			}
		}

		let absolutePath: string | null = null
		const { rawPath, target } = parseInternalLinkTarget(rawTarget)
		const resolvedPath = resolveInternalLinkPath({
			rawPath,
			target,
			workspaceFiles,
			workspacePath,
			currentTabPath: currentTab?.path ?? null,
		})

		if (resolvedPath) {
			await openTab(resolvedPath)
			return
		}

		if (rawTarget.startsWith("/")) {
			const workspaceRelativePath = stripLeadingSlashes(rawTarget)
			absolutePath = join(workspacePath, workspaceRelativePath)
		} else {
			const currentPath = currentTab?.path
			if (!currentPath) {
				return
			}

			const currentDirectory = pathDirname(currentPath)
			absolutePath = join(currentDirectory, rawTarget)
		}

		if (!absolutePath) {
			return
		}

		if (!isPathInsideWorkspaceRoot(absolutePath, workspacePath)) {
			console.warn("Workspace link outside of root blocked:", absolutePath)
			return
		}

		await openTab(absolutePath)
	} catch (error) {
		console.error("Failed to open workspace link:", error)
	}
}
