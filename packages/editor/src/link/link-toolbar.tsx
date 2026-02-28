import { flip, offset, type UseVirtualFloatingOptions } from "@platejs/floating"
import {
	type LinkFloatingToolbarState,
	LinkPlugin,
	useFloatingLinkEdit,
	useFloatingLinkEditState,
	useFloatingLinkInsert,
	useFloatingLinkInsertState,
} from "@platejs/link/react"
import { cva } from "class-variance-authority"
import { join, dirname as pathDirname, resolve } from "pathe"
import { KEYS } from "platejs"
import {
	useEditorRef,
	useEditorSelection,
	useFormInputProps,
	usePluginOption,
} from "platejs/react"
import { type AnchorHTMLAttributes, useEffect, useMemo, useRef } from "react"
import type { LinkHostDeps, LinkWorkspaceState } from "../link/link-kit"
import {
	flattenWorkspaceFiles,
	isJavaScriptUrl,
	isPathInsideWorkspaceRoot,
	parseInternalLinkTarget,
	resolveInternalLinkPath,
	safelyDecodeUrl,
	stripLeadingSlashes,
} from "../link/link-toolbar-utils"
import { LinkUrlInput } from "./link-url-input"
import { startsWithHttpProtocol } from "./link-utils"

const popoverVariants = cva(
	"z-50 w-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none",
)

export function LinkFloatingToolbar({
	state,
	host,
	workspaceState,
}: {
	state?: LinkFloatingToolbarState
	host: LinkHostDeps
	workspaceState: LinkWorkspaceState
}) {
	const editor = useEditorRef()
	const selection = useEditorSelection()
	const activeCommentId = usePluginOption({ key: KEYS.comment }, "activeId")
	const activeSuggestionId = usePluginOption(
		{ key: KEYS.suggestion },
		"activeId",
	)
	const mode = usePluginOption(LinkPlugin, "mode")
	const isOpen = usePluginOption(LinkPlugin, "isOpen", editor.id)
	const insertInputRef = useRef<HTMLInputElement>(null)
	const editInputRef = useRef<HTMLInputElement>(null)

	const floatingOptions: UseVirtualFloatingOptions = useMemo(() => {
		return {
			middleware: [
				offset(8),
				flip({
					fallbackPlacements: ["bottom-end", "top-start", "top-end"],
					padding: 12,
				}),
			],
			placement:
				activeSuggestionId || activeCommentId ? "top-start" : "bottom-start",
		}
	}, [activeCommentId, activeSuggestionId])

	const insertState = useFloatingLinkInsertState({
		...state,
		floatingOptions: {
			...floatingOptions,
			...state?.floatingOptions,
		},
	})
	const {
		hidden,
		props: insertProps,
		ref: insertRef,
	} = useFloatingLinkInsert(insertState)

	const editState = useFloatingLinkEditState({
		...state,
		floatingOptions: {
			...floatingOptions,
			...state?.floatingOptions,
		},
	})
	const { props: editProps, ref: editRef } = useFloatingLinkEdit(editState)
	const inputProps = useFormInputProps({
		preventDefaultOnEnterKeydown: true,
	})
	const isEditOpen = isOpen && mode === "edit"
	const isLinkLeafSelected = useMemo(() => {
		if (!selection || !editor.api.isCollapsed()) {
			return false
		}

		if (
			editor.api.some({
				at: selection,
				match: { type: editor.getType(KEYS.link) },
			})
		) {
			return true
		}
		// Cursor at end of link: selection can be right after the link, so above() fails.
		// Check if the point before the cursor is inside a link.
		const beforePoint = editor.api.before(selection.anchor)
		if (!beforePoint) return false
		return !!editor.api.above({
			at: beforePoint,
			match: { type: editor.getType(KEYS.link) },
		})
	}, [editor, selection])

	// Show edit popover when cursor is at end of link (platejs useFloatingLinkEdit
	// only triggers when editor.api.some finds a link, which can fail at the boundary).
	// Move selection to the end of the link so platejs and LinkUrlInput find the element.
	// Skip when user just exited via arrow right (LinkExitPlugin sets _linkExitedArrowRight).
	useEffect(() => {
		if (!selection || !editor.api.isCollapsed() || mode !== "") return
		if (editor.meta._linkExitedArrowRight) {
			editor.meta._linkExitedArrowRight = false
			return
		}
		const linkType = editor.getType(KEYS.link)
		if (editor.api.some({ at: selection, match: { type: linkType } })) return
		const beforePoint = editor.api.before(selection.anchor)
		if (!beforePoint) return
		const linkEntry = editor.api.above({
			at: beforePoint,
			match: { type: linkType },
		})
		if (!linkEntry) return
		const [, path] = linkEntry
		const end = editor.api.end(path)
		if (!end) return
		editor.tf.select({ anchor: end, focus: end })
	}, [editor, mode, selection])

	useEffect(() => {
		if (!isEditOpen || !isLinkLeafSelected) {
			return
		}

		const handleArrowDown = (event: globalThis.KeyboardEvent) => {
			if (event.key !== "ArrowDown") {
				return
			}

			const input = editInputRef.current
			if (!input) {
				return
			}

			const activeElement = document.activeElement
			if (
				activeElement === input ||
				activeElement instanceof HTMLInputElement ||
				activeElement instanceof HTMLTextAreaElement ||
				activeElement instanceof HTMLSelectElement
			) {
				return
			}

			event.preventDefault()
			event.stopPropagation()
			input.focus()
		}

		window.addEventListener("keydown", handleArrowDown, true)

		return () => {
			window.removeEventListener("keydown", handleArrowDown, true)
		}
	}, [isEditOpen, isLinkLeafSelected])

	if (hidden) return null

	const toolbarProps =
		mode === "insert"
			? { ref: insertRef, props: insertProps, inputRef: insertInputRef }
			: mode === "edit"
				? { ref: editRef, props: editProps, inputRef: editInputRef }
				: null
	if (!toolbarProps) return null

	return (
		<div
			ref={toolbarProps.ref}
			className={popoverVariants()}
			{...toolbarProps.props}
		>
			<div className="flex w-[360px] flex-col" {...inputProps}>
				<LinkUrlInput
					inputRef={toolbarProps.inputRef}
					host={host}
					workspaceState={workspaceState}
				/>
			</div>
		</div>
	)
}

type OpenLinkOptions = {
	href: string
	wiki?: boolean
	wikiTarget?: string
	host: LinkHostDeps
	workspaceState: LinkWorkspaceState
}

async function openLink(options: OpenLinkOptions) {
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

export function createLinkLeafDefaultAttributes(
	host: LinkHostDeps,
	getWorkspaceState: () => LinkWorkspaceState,
): AnchorHTMLAttributes<HTMLAnchorElement> {
	return {
		onMouseDown: (event) => {
			const { currentTarget } = event
			const url = currentTarget.dataset.linkUrl || currentTarget.href
			if (isJavaScriptUrl(url)) {
				event.preventDefault()
				event.stopPropagation()
				event.nativeEvent.stopImmediatePropagation?.()
				return
			}

			const isPrimaryClick = event.button === 0
			const hasModifierKey =
				event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
			if (!isPrimaryClick || hasModifierKey) {
				return
			}

			event.preventDefault()
			event.stopPropagation()
			event.nativeEvent.stopImmediatePropagation?.()

			void openLink({
				href: url,
				wiki: currentTarget.dataset.wiki === "true",
				wikiTarget: currentTarget.dataset.wikiTarget || undefined,
				host,
				workspaceState: getWorkspaceState(),
			})
		},
		onClick: (event) => {
			event.preventDefault()
			event.stopPropagation()
			event.nativeEvent.stopImmediatePropagation?.()
		},
	}
}
