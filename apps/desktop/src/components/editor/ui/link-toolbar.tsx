import { buttonVariants } from "@mdit/ui/components/button"
import { cn } from "@mdit/ui/lib/utils"
import { flip, offset, type UseVirtualFloatingOptions } from "@platejs/floating"
import { upsertLink } from "@platejs/link"
import {
	type LinkFloatingToolbarState,
	LinkPlugin,
	useFloatingLinkEdit,
	useFloatingLinkEditState,
	useFloatingLinkInsert,
	useFloatingLinkInsertState,
} from "@platejs/link/react"
import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { cva } from "class-variance-authority"
import { Check, FileIcon, GlobeIcon, Link } from "lucide-react"
import {
	isAbsolute,
	join,
	dirname as pathDirname,
	relative,
	resolve,
} from "pathe"
import type { TLinkElement } from "platejs"
import { KEYS } from "platejs"
import {
	useEditorPlugin,
	useEditorRef,
	useEditorSelection,
	useFormInputProps,
	usePluginOption,
} from "platejs/react"
import {
	type AnchorHTMLAttributes,
	type ChangeEvent,
	type KeyboardEvent,
	type MouseEvent,
	type RefObject,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react"
import { useShallow } from "zustand/shallow"
import { startsWithHttpProtocol } from "@/components/editor/utils/link-utils"
import { useStore } from "@/store"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"

const popoverVariants = cva(
	"z-50 w-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden",
)

export function LinkFloatingToolbar({
	state,
}: {
	state?: LinkFloatingToolbarState
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

		return editor.api.some({
			at: selection,
			match: { type: editor.getType(KEYS.link) },
		})
	}, [editor, selection])

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

	return (
		<>
			{mode === "insert" && (
				<div ref={insertRef} className={popoverVariants()} {...insertProps}>
					<div className="flex w-[360px] flex-col" {...inputProps}>
						<LinkUrlInput inputRef={insertInputRef} />
					</div>
				</div>
			)}

			{mode === "edit" && (
				<div ref={editRef} className={popoverVariants()} {...editProps}>
					<div className="flex w-[360px] flex-col" {...inputProps}>
						<LinkUrlInput inputRef={editInputRef} />
					</div>
				</div>
			)}
		</>
	)
}

type WorkspaceFileOption = {
	absolutePath: string
	displayName: string
	relativePath: string
	relativePathLower: string
}

type LinkMode = "wiki" | "markdown"

type ResolveWikiLinkResult = {
	canonicalTarget: string
	resolvedRelPath?: string | null
	matchCount: number
	disambiguated: boolean
	unresolved: boolean
}

type ResolveWikiLinkParams = {
	workspacePath: string
	currentNotePath?: string | null
	rawTarget: string
	workspaceRelPaths?: string[]
}

const backslashRegex = /\\/g
const multipleSlashesRegex = /\/{2,}/g
const trailingSlashesRegex = /\/+$/

async function resolveWikiLinkViaInvoke(
	params: ResolveWikiLinkParams,
): Promise<ResolveWikiLinkResult> {
	return invoke<ResolveWikiLinkResult>("resolve_wiki_link_command", params)
}

function LinkUrlInput({
	inputRef,
}: {
	inputRef: RefObject<HTMLInputElement | null>
}) {
	const editor = useEditorRef()
	const { api, setOption } = useEditorPlugin(LinkPlugin)

	const {
		entries: workspaceEntries,
		workspacePath,
		tab,
	} = useStore(
		useShallow((state) => ({
			entries: state.entries,
			workspacePath: state.workspacePath,
			tab: state.tab,
		})),
	)
	const currentTabPath = tab?.path ?? null

	const suggestionsSource = useMemo(
		() => flattenWorkspaceFiles(workspaceEntries, workspacePath),
		[workspaceEntries, workspacePath],
	)

	const optionUrl = usePluginOption(LinkPlugin, "url") as string | undefined
	const decodedOptionUrl = useMemo(
		() => (optionUrl ? safelyDecodeUrl(optionUrl) : ""),
		[optionUrl],
	)

	const selection = useEditorSelection()
	const linkEntry = editor.api.node<TLinkElement>({
		match: { type: editor.getType(KEYS.link) },
	})
	const element = (linkEntry?.[0] ?? null) as
		| (TLinkElement & {
				wiki?: boolean
				wikiTarget?: string
		  })
		| null

	const elementUrl = useMemo(
		() => (element?.url ? safelyDecodeUrl(element.url) : ""),
		[element?.url],
	)
	const decodedUrl = decodedOptionUrl || elementUrl

	const [linkMode, setLinkMode] = useState<LinkMode>("wiki")

	useEffect(() => {
		if (!selection) {
			return
		}

		if (!element) {
			setLinkMode("wiki")
			return
		}

		const isWiki = Boolean(element.wiki || element.wikiTarget)
		setLinkMode(isWiki ? "wiki" : "markdown")
	}, [element, selection])

	const displayValue = useMemo(() => {
		if (!decodedUrl && !element?.wikiTarget) {
			return ""
		}

		if (linkMode === "wiki") {
			const wikiTarget = element?.wikiTarget
			if (wikiTarget) {
				return normalizeWikiTargetForDisplay(wikiTarget)
			}

			if (!decodedUrl) {
				return ""
			}

			if (startsWithHttpProtocol(decodedUrl)) {
				return decodedUrl
			}

			return normalizeWikiTargetForDisplay(decodedUrl)
		}

		if (!decodedUrl) {
			return ""
		}

		return normalizeMarkdownPathForDisplay(decodedUrl)
	}, [decodedUrl, element?.wikiTarget, linkMode])

	const [value, setValue] = useState(displayValue)
	const [highlightedIndex, setHighlightedIndex] = useState(-1)
	const listboxId = useId()

	const trimmedValue = useMemo(() => value.trim(), [value])

	const applyUrlToEditor = useCallback(
		(rawUrl: string) => {
			const encoded = ensureUriEncoding(rawUrl)
			setOption("url", encoded)
			return encoded
		},
		[setOption],
	)

	// Sync input value with external URL changes, but prevent unnecessary re-renders
	// by only updating when the value actually changes
	useEffect(() => {
		setValue((previous) =>
			previous === displayValue ? previous : displayValue,
		)
	}, [displayValue])

	const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		event.stopPropagation()
		const nextValue = event.target.value
		setValue(nextValue)
		setHighlightedIndex(-1)
	}, [])

	const isHttpLink = startsWithHttpProtocol(value)

	useEffect(() => {
		if (isHttpLink) {
			setLinkMode("markdown")
		}
	}, [isHttpLink])

	const suggestionsEnabled = !isHttpLink

	const { hasExactMatch, suggestions: filteredSuggestions } = useMemo(() => {
		if (!suggestionsEnabled) {
			return { hasExactMatch: false, suggestions: [] as WorkspaceFileOption[] }
		}

		if (!trimmedValue) {
			return {
				hasExactMatch: false,
				suggestions: [] as WorkspaceFileOption[],
			}
		}

		const normalizedQuery = normalizePathSeparators(trimmedValue)
		const normalizedLowerQuery = normalizedQuery.toLowerCase()
		const pathQueryCandidates = createPathQueryCandidates(normalizedLowerQuery)
		const exactQueryCandidates = new Set(pathQueryCandidates)
		const displayNameQuery = stripCurrentDirectoryPrefix(
			stripLeadingSlashes(normalizedLowerQuery),
		)
		const tabDirectory = currentTabPath ? pathDirname(currentTabPath) : null

		let exactMatchFound = false

		const suggestions = suggestionsSource.filter((file) => {
			const matchesRelativePath = pathQueryCandidates.some((candidate) =>
				file.relativePathLower.includes(candidate),
			)

			if (
				!exactMatchFound &&
				exactQueryCandidates.has(file.relativePathLower)
			) {
				exactMatchFound = true
			}

			if (matchesRelativePath) {
				return true
			}

			if (
				displayNameQuery &&
				file.displayName.toLowerCase().includes(displayNameQuery)
			) {
				return true
			}

			if (tabDirectory) {
				const relativeToTabLower = normalizePathSeparators(
					relative(tabDirectory, file.absolutePath),
				).toLowerCase()

				if (!exactMatchFound && exactQueryCandidates.has(relativeToTabLower)) {
					exactMatchFound = true
				}

				if (
					pathQueryCandidates.some((candidate) =>
						relativeToTabLower.includes(candidate),
					)
				) {
					return true
				}
			}

			return false
		})

		return { hasExactMatch: exactMatchFound, suggestions }
	}, [suggestionsEnabled, suggestionsSource, trimmedValue, currentTabPath])

	useEffect(() => {
		setHighlightedIndex((previous) => {
			if (previous < 0) {
				return -1
			}

			if (previous >= filteredSuggestions.length) {
				return filteredSuggestions.length ? filteredSuggestions.length - 1 : -1
			}

			return previous
		})
	}, [filteredSuggestions])

	useEffect(() => {
		if (highlightedIndex < 0) {
			return
		}

		const highlightedElement = document.getElementById(
			`${listboxId}-${highlightedIndex}`,
		)
		if (highlightedElement) {
			highlightedElement.scrollIntoView({
				block: "nearest",
				behavior: "smooth",
			})
		}
	}, [highlightedIndex, listboxId])

	const submitLink = useCallback(
		({
			mode,
			nextUrl,
			isWebLink,
			wikiTarget,
		}: {
			mode: LinkMode
			nextUrl: string
			isWebLink: boolean
			wikiTarget?: string | null
		}) => {
			applyUrlToEditor(nextUrl)

			const didSubmit = upsertLink(editor, {
				url: nextUrl,
				skipValidation: true,
			})
			if (didSubmit) {
				const entry = editor.api.node<TLinkElement>({
					match: { type: editor.getType(KEYS.link) },
				})

				if (entry) {
					const [, path] = entry
					if (isWebLink || mode === "markdown") {
						editor.tf.unsetNodes(["wiki", "wikiTarget"], {
							at: path,
						})
					} else {
						editor.tf.setNodes(
							{
								wiki: true,
								wikiTarget: wikiTarget ?? nextUrl,
							},
							{ at: path },
						)
					}
				}

				setHighlightedIndex(-1)
				api.floatingLink.hide()
				editor.tf.focus()
				return
			}

			requestAnimationFrame(() => {
				inputRef.current?.focus()
			})
		},
		[api, applyUrlToEditor, editor, inputRef],
	)

	const handleSelectSuggestion = useCallback(
		(file: WorkspaceFileOption) => {
			if (linkMode === "wiki") {
				const fallbackValue = normalizeWikiTargetForDisplay(file.relativePath)
				const applySelection = (nextValue: string) => {
					setValue(nextValue)
					submitLink({
						mode: "wiki",
						nextUrl: nextValue,
						isWebLink: false,
						wikiTarget: nextValue,
					})
				}

				if (!workspacePath) {
					applySelection(fallbackValue)
					return
				}

				void resolveWikiLinkViaInvoke({
					workspacePath,
					currentNotePath: currentTabPath,
					rawTarget: file.relativePath,
				})
					.then((result) => {
						const canonical = normalizeWikiTargetForDisplay(
							result.canonicalTarget,
						)
						applySelection(canonical || fallbackValue)
					})
					.catch((error) => {
						console.warn(
							"Failed to resolve wiki suggestion via invoke; using fallback:",
							error,
						)
						applySelection(fallbackValue)
					})
				return
			}

			if (!currentTabPath) {
				return
			}

			const tabDirectory = pathDirname(currentTabPath)
			const relativePath = relative(tabDirectory, file.absolutePath)

			const normalizedRelativePath = normalizePathSeparators(relativePath)
			const nextValue =
				normalizedRelativePath &&
				!normalizedRelativePath.startsWith(".") &&
				!normalizedRelativePath.startsWith("/")
					? `./${normalizedRelativePath}`
					: normalizedRelativePath

			const displayValue = normalizeMarkdownPathForDisplay(nextValue)

			setValue(displayValue)
			submitLink({
				mode: "markdown",
				nextUrl: displayValue,
				isWebLink: false,
			})
		},
		[currentTabPath, linkMode, submitLink, workspacePath],
	)

	const handleBlur = useCallback(() => {
		requestAnimationFrame(() => {
			setHighlightedIndex(-1)
		})
	}, [])

	const hasQuery = Boolean(trimmedValue)

	const showSuggestionList =
		hasQuery &&
		suggestionsEnabled &&
		!hasExactMatch &&
		filteredSuggestions.length > 0
	const showEmptyState =
		hasQuery &&
		suggestionsEnabled &&
		!hasExactMatch &&
		filteredSuggestions.length === 0

	const confirmLink = useCallback(async () => {
		if (!trimmedValue) {
			requestAnimationFrame(() => {
				inputRef.current?.focus()
			})
			return
		}

		const isWebLink = startsWithHttpProtocol(trimmedValue)
		let nextUrl = trimmedValue
		let nextWikiTarget: string | null = null

		if (!isWebLink && linkMode === "wiki") {
			const normalizedTarget = toWorkspaceRelativeWikiTarget({
				input: trimmedValue,
				workspacePath,
				currentTabPath,
			})
			const fallbackTarget = normalizedTarget
				? normalizedTarget
				: normalizeWikiTargetForDisplay(trimmedValue)

			if (workspacePath) {
				try {
					const resolved = await resolveWikiLinkViaInvoke({
						workspacePath,
						currentNotePath: currentTabPath,
						rawTarget: trimmedValue,
					})
					const canonicalTarget = normalizeWikiTargetForDisplay(
						resolved.canonicalTarget,
					)
					const preferredTarget = resolved.unresolved
						? fallbackTarget || canonicalTarget
						: canonicalTarget || fallbackTarget
					if (preferredTarget) {
						nextUrl = preferredTarget
						nextWikiTarget = preferredTarget
					}
				} catch (error) {
					console.warn(
						"Failed to resolve wiki link via invoke; using fallback:",
						error,
					)
					if (fallbackTarget) {
						nextUrl = fallbackTarget
						nextWikiTarget = fallbackTarget
					}
				}
			} else if (fallbackTarget) {
				nextUrl = fallbackTarget
				nextWikiTarget = fallbackTarget
			}
		}

		if (
			!isWebLink &&
			linkMode === "markdown" &&
			currentTabPath &&
			!trimmedValue.startsWith("#")
		) {
			const { rawPath, target } = parseInternalLinkTarget(trimmedValue)
			const resolvedPath = resolveInternalLinkPath({
				rawPath,
				target,
				workspaceFiles: suggestionsSource,
				workspacePath,
				currentTabPath,
			})

			if (resolvedPath) {
				const tabDirectory = pathDirname(currentTabPath)
				const relativePath = normalizePathSeparators(
					relative(tabDirectory, resolvedPath),
				)
				nextUrl =
					relativePath &&
					!relativePath.startsWith(".") &&
					!relativePath.startsWith("/")
						? `./${relativePath}`
						: relativePath
			}
		}

		submitLink({
			mode: linkMode,
			nextUrl,
			isWebLink,
			wikiTarget: nextWikiTarget,
		})
	}, [
		inputRef,
		currentTabPath,
		linkMode,
		suggestionsSource,
		submitLink,
		trimmedValue,
		workspacePath,
	])

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			const { key } = event

			if (key === "Enter") {
				event.preventDefault()
				event.stopPropagation()
				event.nativeEvent.stopImmediatePropagation?.()

				if (filteredSuggestions.length && highlightedIndex >= 0) {
					const option = filteredSuggestions[highlightedIndex]
					if (option) {
						handleSelectSuggestion(option)
					}
					return
				}

				void confirmLink()
				return
			}

			event.stopPropagation()
			event.nativeEvent.stopImmediatePropagation?.()

			if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "a") {
				event.preventDefault()
				event.currentTarget.select()
				return
			}

			if (key === "Escape") {
				event.preventDefault()
				api.floatingLink.hide()
				editor.tf.focus()
				return
			}

			if (key === "ArrowUp") {
				event.preventDefault()
				if (highlightedIndex >= 0) {
					setHighlightedIndex((previous) => {
						if (previous <= 0) {
							return -1
						}
						return previous - 1
					})
					return
				}

				api.floatingLink.hide()
				editor.tf.focus()
				return
			}

			if (!filteredSuggestions.length) {
				return
			}

			if (key === "ArrowDown") {
				event.preventDefault()
				setHighlightedIndex((previous) => {
					const next = previous + 1
					if (next < 0) return 0
					return next >= filteredSuggestions.length
						? filteredSuggestions.length - 1
						: next
				})
				return
			}
		},
		[
			confirmLink,
			filteredSuggestions,
			handleSelectSuggestion,
			highlightedIndex,
			api,
			editor,
		],
	)

	const handleConfirm = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.preventDefault()
			event.stopPropagation()
			event.nativeEvent.stopImmediatePropagation?.()

			void confirmLink()
		},
		[confirmLink],
	)

	return (
		<div className="flex flex-1 flex-col">
			<div className="flex items-center justify-between pl-2 pb-1 text-xs text-muted-foreground">
				<span>Link type</span>
				<div className="flex items-center gap-1">
					<button
						type="button"
						className={cn(
							buttonVariants({ size: "sm", variant: "ghost" }),
							"h-6 px-2 text-xs",
							linkMode === "wiki" && "bg-accent text-accent-foreground",
						)}
						onClick={() => setLinkMode("wiki")}
						disabled={isHttpLink}
					>
						Wiki
					</button>
					<button
						type="button"
						className={cn(
							buttonVariants({ size: "sm", variant: "ghost" }),
							"h-6 px-2 text-xs",
							linkMode === "markdown" && "bg-accent text-accent-foreground",
						)}
						onClick={() => setLinkMode("markdown")}
					>
						Markdown
					</button>
				</div>
			</div>
			<div className="flex items-center">
				<div className="flex items-center pr-1 pl-2 text-muted-foreground">
					<LinkIcon value={value} />
				</div>

				<div className="flex-1">
					<input
						ref={inputRef}
						className="flex h-[28px] w-full rounded-md border-none bg-transparent px-1.5 py-1 text-base placeholder:text-muted-foreground focus-visible:ring-transparent focus-visible:outline-none md:text-sm"
						placeholder="Paste link"
						value={value}
						data-plate-focus
						onChange={handleChange}
						onBlur={handleBlur}
						onKeyDown={handleKeyDown}
						role="combobox"
						aria-expanded={showSuggestionList || showEmptyState}
						aria-controls={showSuggestionList ? listboxId : undefined}
						aria-activedescendant={
							showSuggestionList && highlightedIndex >= 0
								? `${listboxId}-${highlightedIndex}`
								: undefined
						}
						aria-autocomplete="list"
						autoComplete="off"
						spellCheck={false}
					/>
				</div>

				<button
					type="button"
					className={`${buttonVariants({ size: "icon", variant: "ghost" })} ml-1 shrink-0 text-muted-foreground`}
					aria-label="Apply link"
					title="Apply link"
					onClick={handleConfirm}
					onMouseDown={(event) => {
						event.stopPropagation()
					}}
					disabled={!trimmedValue}
				>
					<Check className="size-4" />
				</button>
			</div>

			{(showSuggestionList || showEmptyState) && (
				<div className="mt-2">
					<div
						onMouseLeave={() => {
							setHighlightedIndex(-1)
						}}
					>
						<div
							id={listboxId}
							role="listbox"
							className="max-h-[300px] scroll-py-1 overflow-y-auto"
						>
							{showEmptyState ? (
								<div className="py-4 text-center text-sm text-muted-foreground">
									No matching notes
								</div>
							) : (
								<div className="space-y-0.5 text-foreground">
									{filteredSuggestions.map((file, index) => {
										const isHighlighted = index === highlightedIndex
										return (
											<div
												key={file.absolutePath}
												id={`${listboxId}-${index}`}
												data-selected={isHighlighted}
												className={cn(
													"relative flex cursor-default select-none flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-sm outline-hidden",
													"data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
													isHighlighted
														? "bg-accent text-accent-foreground"
														: "text-foreground",
												)}
												// Prevent mousedown from stealing focus from the input field
												onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
													event.preventDefault()
												}}
												onMouseEnter={() => {
													setHighlightedIndex(index)
												}}
												onClick={() => handleSelectSuggestion(file)}
											>
												<span className="text-sm font-medium max-w-full truncate">
													{file.displayName}
												</span>
												<span className="text-xs text-muted-foreground max-w-full truncate">
													{file.relativePath}
												</span>
											</div>
										)
									})}
								</div>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

function LinkIcon({ value }: { value: string }) {
	const trimmed = value.trim()

	if (startsWithHttpProtocol(trimmed)) {
		return <GlobeIcon className="size-4" />
	}

	if (trimmed.length > 0) {
		return <FileIcon className="size-4" />
	}

	return <Link className="size-4" />
}

type OpenLinkOptions = {
	href: string
	wiki?: boolean
	wikiTarget?: string
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
			await openUrl(targetUrl)
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
		openTab,
		tab: currentTab,
		workspacePath,
	} = useStore.getState()

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
				const resolved = await resolveWikiLinkViaInvoke({
					workspacePath,
					currentNotePath: currentTab?.path ?? null,
					rawTarget,
				})
				if (resolved.resolvedRelPath) {
					const absoluteResolved = resolve(
						workspacePath,
						resolved.resolvedRelPath,
					)
					const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspacePath)
					const normalizedAbsolute = normalizePathSeparators(absoluteResolved)
					if (
						normalizedAbsolute !== normalizedWorkspaceRoot &&
						!normalizedAbsolute.startsWith(`${normalizedWorkspaceRoot}/`)
					) {
						console.warn(
							"Workspace link outside of root blocked:",
							normalizedAbsolute,
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

		const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspacePath)
		if (!normalizedWorkspaceRoot) {
			console.warn("Workspace root missing; link open aborted")
			return
		}

		const normalizedAbsolute = normalizePathSeparators(absolutePath)

		if (
			normalizedAbsolute !== normalizedWorkspaceRoot &&
			!normalizedAbsolute.startsWith(`${normalizedWorkspaceRoot}/`)
		) {
			console.warn(
				"Workspace link outside of root blocked:",
				normalizedAbsolute,
			)
			return
		}

		await openTab(absolutePath)
	} catch (error) {
		console.error("Failed to open workspace link:", error)
	}
}

export const linkLeafDefaultAttributes: AnchorHTMLAttributes<HTMLAnchorElement> =
	{
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
			})
		},
		onClick: (event) => {
			event.preventDefault()
			event.stopPropagation()
			event.nativeEvent.stopImmediatePropagation?.()
		},
	}

// Recursively traverse workspace file tree and collect all .md files for autocomplete
// Returns flattened list with relative paths for suggestion matching
function flattenWorkspaceFiles(
	entries: WorkspaceEntry[],
	workspacePath: string | null,
): WorkspaceFileOption[] {
	if (!workspacePath) {
		return []
	}

	const normalizedRoot = normalizeWorkspaceRoot(workspacePath)
	const files: WorkspaceFileOption[] = []

	const visit = (nodes: WorkspaceEntry[]) => {
		for (const node of nodes) {
			if (node.isDirectory) {
				if (node.children) {
					visit(node.children)
				}
				continue
			}

			// Only include .md files for linking
			if (!node.name.toLowerCase().endsWith(".md")) {
				continue
			}

			const normalizedAbsolute = normalizePathSeparators(node.path)
			let relativePath = ""

			// Calculate path relative to workspace root by stripping the root prefix
			if (normalizedAbsolute.startsWith(`${normalizedRoot}/`)) {
				relativePath = normalizedAbsolute.slice(normalizedRoot.length + 1)
			} else if (normalizedAbsolute.startsWith(normalizedRoot)) {
				relativePath = normalizedAbsolute.slice(normalizedRoot.length)
			}

			relativePath = stripLeadingSlashes(relativePath)
			if (!relativePath) {
				relativePath = node.name
			}

			const normalizedRelative = normalizePathSeparators(relativePath)

			files.push({
				absolutePath: node.path,
				displayName: node.name,
				relativePath: normalizedRelative,
				relativePathLower: normalizedRelative.toLowerCase(),
			})
		}
	}

	visit(entries)

	files.sort((a, b) => a.relativePathLower.localeCompare(b.relativePathLower))

	return files
}

// Convert all path separators to forward slashes and remove duplicates/trailing slashes
// Ensures consistent path format across different operating systems
function createPathQueryCandidates(normalizedLowerQuery: string): string[] {
	if (!normalizedLowerQuery) {
		return []
	}

	const candidates = new Set<string>([normalizedLowerQuery])

	const withoutCurrentDir = stripCurrentDirectoryPrefix(normalizedLowerQuery)
	candidates.add(withoutCurrentDir)

	const withoutLeadingSlashes = stripLeadingSlashes(normalizedLowerQuery)
	candidates.add(withoutLeadingSlashes)

	const withoutBoth = stripCurrentDirectoryPrefix(withoutLeadingSlashes)
	candidates.add(withoutBoth)

	return Array.from(candidates).filter(Boolean)
}

function stripCurrentDirectoryPrefix(value: string): string {
	let result = value
	while (result.startsWith("./")) {
		result = result.slice(2)
	}
	return result
}

function normalizePathSeparators(path: string): string {
	const withForwardSlashes = path.replace(backslashRegex, "/")
	const collapsed = withForwardSlashes.replace(multipleSlashesRegex, "/")
	if (collapsed.length <= 1) {
		return collapsed
	}
	return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed
}

function normalizeWikiTargetForDisplay(value: string): string {
	const decoded = safelyDecodeUrl(value.trim())
	if (!decoded) {
		return ""
	}

	const [pathPart, hashPart] = decoded.split("#", 2)
	let normalized = normalizePathSeparators(pathPart)
	normalized = stripCurrentDirectoryPrefix(normalized)
	normalized = stripLeadingSlashes(normalized)

	if (normalized.endsWith(".mdx")) {
		normalized = normalized.slice(0, -4)
	} else if (normalized.endsWith(".md")) {
		normalized = normalized.slice(0, -3)
	}

	return hashPart ? `${normalized}#${hashPart}` : normalized
}

function normalizeMarkdownPathForDisplay(value: string): string {
	const decoded = safelyDecodeUrl(value.trim())
	if (!decoded) {
		return ""
	}

	const [pathPart, hashPart] = decoded.split("#", 2)
	const normalized = normalizePathSeparators(pathPart)
	return hashPart ? `${normalized}#${hashPart}` : normalized
}

function toWorkspaceRelativeWikiTarget(options: {
	input: string
	workspacePath: string | null
	currentTabPath: string | null
}): string {
	const { input, workspacePath, currentTabPath } = options
	const decoded = safelyDecodeUrl(input.trim())
	if (!decoded) {
		return ""
	}

	const [pathPart, hashPart] = decoded.split("#", 2)
	let normalizedPath = normalizePathSeparators(pathPart)

	if (!normalizedPath) {
		return hashPart ? `#${hashPart}` : ""
	}

	const hasRootPrefix = normalizedPath.startsWith("/")
	const hasRelativePrefix =
		normalizedPath.startsWith("./") || normalizedPath.startsWith("../")
	const isAbsPath = isAbsolute(normalizedPath)

	if (workspacePath && (hasRootPrefix || hasRelativePrefix || isAbsPath)) {
		const normalizedRoot = normalizeWorkspaceRoot(workspacePath)
		let absolutePath: string | null = null

		if (hasRootPrefix) {
			absolutePath = join(normalizedRoot, stripLeadingSlashes(normalizedPath))
		} else if (isAbsPath) {
			absolutePath = normalizedPath
		} else if (currentTabPath) {
			absolutePath = resolve(pathDirname(currentTabPath), normalizedPath)
		}

		if (absolutePath) {
			const normalizedAbsolute = normalizePathSeparators(absolutePath)
			if (normalizedAbsolute === normalizedRoot) {
				normalizedPath = ""
			} else if (normalizedAbsolute.startsWith(`${normalizedRoot}/`)) {
				normalizedPath = normalizedAbsolute.slice(normalizedRoot.length + 1)
			}
		}
	}

	normalizedPath = stripCurrentDirectoryPrefix(
		stripLeadingSlashes(normalizedPath),
	)
	normalizedPath = stripMarkdownExtension(normalizedPath)

	return hashPart ? `${normalizedPath}#${hashPart}` : normalizedPath
}

function stripMarkdownExtension(value: string): string {
	const lower = value.toLowerCase()
	if (lower.endsWith(".mdx")) {
		return value.slice(0, -4)
	}
	if (lower.endsWith(".md")) {
		return value.slice(0, -3)
	}
	return value
}

function parseInternalLinkTarget(value: string): {
	rawPath: string
	target: string
	hash?: string
} {
	const decoded = safelyDecodeUrl(value.trim())
	const [pathPart, hashPart] = decoded.split("#", 2)
	let rawPath = normalizePathSeparators(pathPart)
	rawPath = stripCurrentDirectoryPrefix(rawPath)
	rawPath = stripLeadingSlashes(rawPath)

	return {
		rawPath,
		target: stripMarkdownExtension(rawPath),
		hash: hashPart,
	}
}

function pickPreferredFile(
	matches: WorkspaceFileOption[],
	normalizedCurrentDir: string | null,
): WorkspaceFileOption | null {
	if (!matches.length) {
		return null
	}

	if (!normalizedCurrentDir) {
		return matches[0]
	}

	const preferred = matches.find((file) => {
		const fileDir = normalizePathSeparators(pathDirname(file.absolutePath))
		return fileDir === normalizedCurrentDir
	})

	return preferred ?? matches[0]
}

function resolveInternalLinkPath(options: {
	rawPath: string
	target: string
	workspaceFiles: WorkspaceFileOption[]
	workspacePath: string | null
	currentTabPath: string | null
}): string | null {
	const { rawPath, target, workspaceFiles, workspacePath, currentTabPath } =
		options

	if (!workspacePath || workspaceFiles.length === 0) {
		return null
	}

	const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspacePath)
	if (!normalizedWorkspaceRoot) {
		return null
	}

	const normalizedCurrentDir = currentTabPath
		? normalizePathSeparators(pathDirname(currentTabPath))
		: null

	const normalizedAbsoluteMap = new Map<string, string>()
	for (const file of workspaceFiles) {
		normalizedAbsoluteMap.set(
			normalizePathSeparators(file.absolutePath),
			file.absolutePath,
		)
	}

	const segments = new Set<string>()
	if (rawPath) {
		segments.add(rawPath)
	}
	if (target) {
		segments.add(`${target}.md`)
		segments.add(`${target}.mdx`)
	}

	const candidates: string[] = []
	const addCandidate = (base: string | null, segment: string) => {
		if (!base || !segment) {
			return
		}
		candidates.push(normalizePathSeparators(join(base, segment)))
	}

	for (const segment of segments) {
		addCandidate(normalizedCurrentDir, segment)
		addCandidate(normalizedWorkspaceRoot, segment)
	}

	for (const candidate of candidates) {
		const matched = normalizedAbsoluteMap.get(candidate)
		if (matched) {
			return matched
		}
	}

	const targetLower = target.toLowerCase()
	if (targetLower) {
		const relativeMatches = workspaceFiles.filter(
			(file) =>
				stripMarkdownExtension(file.relativePath).toLowerCase() === targetLower,
		)
		const relativeMatch = pickPreferredFile(
			relativeMatches,
			normalizedCurrentDir,
		)
		if (relativeMatch) {
			return relativeMatch.absolutePath
		}
	}

	const hasSeparator = target.includes("/") || target.includes("\\")
	if (!hasSeparator && targetLower) {
		const nameMatches = workspaceFiles.filter(
			(file) =>
				stripMarkdownExtension(file.displayName).toLowerCase() === targetLower,
		)
		const nameMatch = pickPreferredFile(nameMatches, normalizedCurrentDir)
		if (nameMatch) {
			return nameMatch.absolutePath
		}
	}

	return null
}

function normalizeWorkspaceRoot(workspacePath: string): string {
	if (!workspacePath) {
		return ""
	}
	const normalized = normalizePathSeparators(workspacePath)
	return normalized.replace(trailingSlashesRegex, "")
}

function stripLeadingSlashes(value: string): string {
	let index = 0
	while (
		index < value.length &&
		(value[index] === "/" || value[index] === "\\")
	) {
		index += 1
	}
	return value.slice(index)
}

// Store URLs percent-encoded so markdown serialization keeps spaces & Unicode stable
// while avoiding double-encoding if segments are already escaped.
function ensureUriEncoding(url: string): string {
	try {
		const isEncoded = url !== decodeURIComponent(url)
		return isEncoded ? url : encodeURI(url)
	} catch (error) {
		if (error instanceof URIError) {
			return url
		}
		throw error
	}
}

function safelyDecodeUrl(url: string): string {
	try {
		return decodeURI(url)
	} catch (error) {
		if (error instanceof URIError) {
			return url
		}
		throw error
	}
}

function isJavaScriptUrl(url: string): boolean {
	const decoded = safelyDecodeUrl(url)
	const normalized = decoded.trim().toLowerCase()
	return normalized.startsWith("javascript:")
}
