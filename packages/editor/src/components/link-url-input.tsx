import { exitLinkForwardAtSelection } from "@mdit/editor/utils/link-exit"
import { startsWithHttpProtocol } from "@mdit/editor/utils/link-utils"
import { WIKI_LINK_PLACEHOLDER_TEXT } from "@mdit/editor/utils/wiki-link-constants"
import { buttonVariants } from "@mdit/ui/components/button"
import { cn } from "@mdit/ui/lib/utils"
import { upsertLink } from "@platejs/link"
import { LinkPlugin } from "@platejs/link/react"
import { cva } from "class-variance-authority"
import { Check, FileIcon, FilePlus, GlobeIcon, Link } from "lucide-react"
import { dirname as pathDirname, relative } from "pathe"
import type { TLinkElement } from "platejs"
import { KEYS } from "platejs"
import {
	useEditorPlugin,
	useEditorRef,
	useEditorSelection,
	usePluginOption,
} from "platejs/react"
import {
	type ChangeEvent,
	type KeyboardEvent,
	type MouseEvent,
	type RefObject,
	useCallback,
	useDeferredValue,
	useEffect,
	useId,
	useMemo,
	useState,
} from "react"
import type {
	LinkHostDeps,
	LinkIndexingConfig,
	LinkWorkspaceState,
} from "../plugins/link-kit"
import {
	createPathQueryCandidates,
	ensureUriEncoding,
	flattenWorkspaceFiles,
	formatMarkdownPath,
	getLinkedNoteDisplayName,
	type LinkMode,
	normalizeMarkdownPathForDisplay,
	normalizePathSeparators,
	normalizeWikiTargetForDisplay,
	parseInternalLinkTarget,
	resolveInternalLinkPath,
	safelyDecodeUrl,
	stripCurrentDirectoryPrefix,
	stripLeadingSlashes,
	toWorkspaceRelativeWikiTarget,
	type WorkspaceFileOption,
} from "../utils/link-toolbar-utils"

const modeButtonVariants = cva("h-6 px-2 text-xs")
const MAX_SUGGESTIONS = 50
const RELATED_NOTES_LIMIT = 5

type SearchableWorkspaceFile = {
	file: WorkspaceFileOption
	displayNameLower: string
	relativePathLower: string
	relativeToTabLower: string | null
}

export function LinkUrlInput({
	inputRef,
	host,
	workspaceState,
}: {
	inputRef: RefObject<HTMLInputElement | null>
	host: LinkHostDeps
	workspaceState: LinkWorkspaceState
}) {
	const editor = useEditorRef()
	const { api, setOption } = useEditorPlugin(LinkPlugin)
	const { entries: workspaceEntries, workspacePath, tab } = workspaceState
	const [indexingConfig, setIndexingConfig] =
		useState<LinkIndexingConfig | null>(null)
	const hasEmbeddingConfig = Boolean(
		indexingConfig?.embeddingProvider && indexingConfig?.embeddingModel,
	)
	const currentTabPath = tab?.path ?? null
	const currentRelativeDir = useMemo(() => {
		if (currentTabPath && workspacePath) {
			const dir = pathDirname(currentTabPath)
			const relDir = relative(workspacePath, dir)
			return normalizePathSeparators(relDir) || "root"
		}
		return "root"
	}, [currentTabPath, workspacePath])

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
	const [relatedSuggestions, setRelatedSuggestions] = useState<
		WorkspaceFileOption[]
	>([])
	const listboxId = useId()

	const trimmedValue = useMemo(() => value.trim(), [value])
	const deferredQuery = useDeferredValue(trimmedValue)

	const searchableSuggestions = useMemo(() => {
		const tabDirectory = currentTabPath ? pathDirname(currentTabPath) : null

		return suggestionsSource.map<SearchableWorkspaceFile>((file) => {
			const relativeToTabLower = tabDirectory
				? normalizePathSeparators(
						relative(tabDirectory, file.absolutePath),
					).toLowerCase()
				: null

			return {
				file,
				displayNameLower: file.displayName.toLowerCase(),
				relativePathLower: file.relativePathLower,
				relativeToTabLower,
			}
		})
	}, [currentTabPath, suggestionsSource])

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

	useEffect(() => {
		if (!workspacePath || linkMode !== "wiki" || trimmedValue) {
			return
		}

		if (!host.getIndexingConfig) {
			setIndexingConfig(null)
			return
		}

		let cancelled = false
		void host
			.getIndexingConfig(workspacePath)
			.then((config) => {
				if (!cancelled) {
					setIndexingConfig(config)
				}
			})
			.catch((error) => {
				if (!cancelled) {
					console.error("Failed to load indexing config:", error)
					setIndexingConfig(null)
				}
			})

		return () => {
			cancelled = true
		}
	}, [host, linkMode, trimmedValue, workspacePath])

	useEffect(() => {
		if (
			!workspacePath ||
			!currentTabPath ||
			linkMode !== "wiki" ||
			trimmedValue ||
			!hasEmbeddingConfig
		) {
			setRelatedSuggestions([])
			return
		}

		let cancelled = false
		if (!host.getRelatedNotes) {
			setRelatedSuggestions([])
			return
		}

		host
			.getRelatedNotes({
				workspacePath,
				currentTabPath,
				limit: RELATED_NOTES_LIMIT,
			})
			.then((entries) => {
				if (!cancelled) {
					setRelatedSuggestions(entries)
				}
			})
			.catch((error) => {
				console.error("Failed to fetch related notes for link toolbar:", error)
				if (!cancelled) {
					setRelatedSuggestions([])
				}
			})

		return () => {
			cancelled = true
		}
	}, [
		currentTabPath,
		hasEmbeddingConfig,
		host.getRelatedNotes,
		linkMode,
		trimmedValue,
		workspacePath,
	])

	const { hasExactMatch, suggestions: filteredSuggestions } = useMemo(() => {
		if (!suggestionsEnabled) {
			return { hasExactMatch: false, suggestions: [] as WorkspaceFileOption[] }
		}

		if (!deferredQuery) {
			return {
				hasExactMatch: false,
				suggestions: [] as WorkspaceFileOption[],
			}
		}

		const normalizedQuery = normalizePathSeparators(deferredQuery)
		const normalizedLowerQuery = normalizedQuery.toLowerCase()
		const pathQueryCandidates = createPathQueryCandidates(normalizedLowerQuery)
		const exactQueryCandidates = new Set(pathQueryCandidates)
		const displayNameQuery = stripCurrentDirectoryPrefix(
			stripLeadingSlashes(normalizedLowerQuery),
		)

		let exactMatchFound = false
		const suggestions: WorkspaceFileOption[] = []

		for (const searchable of searchableSuggestions) {
			const { file, displayNameLower, relativePathLower, relativeToTabLower } =
				searchable
			const matchesRelativePath = pathQueryCandidates.some((candidate) =>
				relativePathLower.includes(candidate),
			)

			if (
				!exactMatchFound &&
				(exactQueryCandidates.has(relativePathLower) ||
					(relativeToTabLower && exactQueryCandidates.has(relativeToTabLower)))
			) {
				exactMatchFound = true
			}

			if (suggestions.length < MAX_SUGGESTIONS) {
				const matchesDisplayName =
					displayNameQuery && displayNameLower.includes(displayNameQuery)
				const matchesRelativeToTab =
					relativeToTabLower &&
					pathQueryCandidates.some((candidate) =>
						relativeToTabLower.includes(candidate),
					)

				if (matchesRelativePath || matchesDisplayName || matchesRelativeToTab) {
					suggestions.push(file)
				}
			}
		}

		return { hasExactMatch: exactMatchFound, suggestions }
	}, [deferredQuery, searchableSuggestions, suggestionsEnabled])

	const hasQuery = Boolean(trimmedValue)
	const showRelatedSuggestionList =
		!hasQuery &&
		suggestionsEnabled &&
		linkMode === "wiki" &&
		relatedSuggestions.length > 0
	const showFilteredSuggestionList =
		hasQuery &&
		suggestionsEnabled &&
		!hasExactMatch &&
		filteredSuggestions.length > 0
	const showSuggestionList =
		showRelatedSuggestionList || showFilteredSuggestionList
	const showEmptyState =
		hasQuery &&
		suggestionsEnabled &&
		!hasExactMatch &&
		filteredSuggestions.length === 0
	const activeSuggestions = showRelatedSuggestionList
		? relatedSuggestions
		: filteredSuggestions

	useEffect(() => {
		setHighlightedIndex((previous) => {
			if (previous < 0) {
				return -1
			}

			if (previous >= activeSuggestions.length) {
				return activeSuggestions.length ? activeSuggestions.length - 1 : -1
			}

			return previous
		})
	}, [activeSuggestions])

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

					const currentLinkText = editor.api.string(path)
					if (currentLinkText === WIKI_LINK_PLACEHOLDER_TEXT) {
						const linkedNoteDisplayName = getLinkedNoteDisplayName({
							mode,
							nextUrl,
							wikiTarget,
							isWebLink,
						})
						if (linkedNoteDisplayName) {
							const start = editor.api.start(path)
							const end = editor.api.end(path)
							if (start && end) {
								editor.tf.insertText(linkedNoteDisplayName, {
									at: { anchor: start, focus: end },
								})
							}
						}
					}

					const end = editor.api.end(path)
					if (end) {
						editor.tf.select({ anchor: end, focus: end })
					}
				}

				setTimeout(() => {
					exitLinkForwardAtSelection(editor, {
						allowFromInsideLink: true,
						focusEditor: false,
						markArrowRightExit: true,
					})

					setHighlightedIndex(-1)
					api.floatingLink.hide()
					editor.tf.focus()
				}, 0)
				return
			}

			requestAnimationFrame(() => {
				inputRef.current?.focus()
			})
		},
		[api, applyUrlToEditor, editor, inputRef],
	)

	const resolvePreferredWikiTarget = useCallback(
		async ({
			rawTarget,
			fallbackTarget,
			preferFallbackWhenUnresolved,
			warnContext,
		}: {
			rawTarget: string
			fallbackTarget: string
			preferFallbackWhenUnresolved: boolean
			warnContext: string
		}): Promise<string> => {
			if (!workspacePath) {
				return fallbackTarget
			}

			try {
				const resolved = await host.resolveWikiLink({
					workspacePath,
					currentNotePath: currentTabPath,
					rawTarget,
				})
				const canonicalTarget = normalizeWikiTargetForDisplay(
					resolved.canonicalTarget,
				)

				if (preferFallbackWhenUnresolved && resolved.unresolved) {
					return fallbackTarget || canonicalTarget
				}

				return canonicalTarget || fallbackTarget
			} catch (error) {
				console.warn(warnContext, error)
				return fallbackTarget
			}
		},
		[currentTabPath, host, workspacePath],
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

				// Suggestions already map to an existing file; canonicalize for storage.
				// On failure, keep the original suggestion.
				void resolvePreferredWikiTarget({
					rawTarget: file.relativePath,
					fallbackTarget: fallbackValue,
					preferFallbackWhenUnresolved: false,
					warnContext:
						"Failed to resolve wiki suggestion via invoke; using fallback:",
				}).then((preferredTarget) => {
					applySelection(preferredTarget)
				})
				return
			}

			if (!currentTabPath) {
				return
			}

			const tabDirectory = pathDirname(currentTabPath)
			const relativePath = relative(tabDirectory, file.absolutePath)

			const normalizedRelativePath = normalizePathSeparators(relativePath)
			const nextValue = formatMarkdownPath(normalizedRelativePath)

			const displayValue = normalizeMarkdownPathForDisplay(nextValue)

			setValue(displayValue)
			submitLink({
				mode: "markdown",
				nextUrl: displayValue,
				isWebLink: false,
			})
		},
		[
			currentTabPath,
			linkMode,
			resolvePreferredWikiTarget,
			submitLink,
			workspacePath,
		],
	)

	const handleBlur = useCallback(() => {
		requestAnimationFrame(() => {
			setHighlightedIndex(-1)
		})
	}, [])

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

			if (fallbackTarget) {
				const preferredTarget = await resolvePreferredWikiTarget({
					rawTarget: trimmedValue,
					fallbackTarget,
					preferFallbackWhenUnresolved: true,
					warnContext:
						"Failed to resolve wiki link via invoke; using fallback:",
				})
				nextUrl = preferredTarget
				nextWikiTarget = preferredTarget
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
				nextUrl = formatMarkdownPath(relativePath)
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
		resolvePreferredWikiTarget,
		suggestionsSource,
		submitLink,
		trimmedValue,
		workspacePath,
	])

	const handleCreateNote = useCallback(async () => {
		if (!workspacePath) return
		const targetDirectory = currentTabPath
			? pathDirname(currentTabPath)
			: workspacePath

		const fallbackName = trimmedValue || "Untitled"

		const newFilePath = await host.createNote(targetDirectory, {
			initialName: fallbackName,
			openTab: false,
		})

		if (!newFilePath) return

		let finalUrl = fallbackName
		let nextWikiTarget: string | null = fallbackName

		if (linkMode === "markdown") {
			const relativePath = normalizePathSeparators(
				relative(targetDirectory, newFilePath),
			)
			finalUrl = formatMarkdownPath(relativePath)
			nextWikiTarget = null
		} else {
			const baseName =
				newFilePath.split("/").pop()?.replace(/\.md$/, "") || fallbackName
			finalUrl = baseName
			nextWikiTarget = baseName
		}

		submitLink({
			mode: linkMode,
			nextUrl: finalUrl,
			isWebLink: false,
			wikiTarget: nextWikiTarget,
		})

		await host.openTab(newFilePath)
	}, [host, workspacePath, currentTabPath, trimmedValue, linkMode, submitLink])

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			const { key } = event

			if (key === "Enter") {
				event.preventDefault()
				event.stopPropagation()
				event.nativeEvent.stopImmediatePropagation?.()

				if (activeSuggestions.length && highlightedIndex >= 0) {
					const option = activeSuggestions[highlightedIndex]
					if (option) {
						handleSelectSuggestion(option)
					}
					return
				}

				if (showEmptyState) {
					void handleCreateNote()
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

			if (!activeSuggestions.length) {
				return
			}

			if (key === "ArrowDown") {
				event.preventDefault()
				setHighlightedIndex((previous) => {
					const next = previous + 1
					if (next < 0) return 0
					return next >= activeSuggestions.length
						? activeSuggestions.length - 1
						: next
				})
				return
			}
		},
		[
			activeSuggestions,
			confirmLink,
			handleSelectSuggestion,
			handleCreateNote,
			highlightedIndex,
			api,
			editor,
			showEmptyState,
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
							modeButtonVariants(),
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
							modeButtonVariants(),
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
					<LinkIcon value={value} linkMode={linkMode} />
				</div>

				<div className="flex-1">
					<input
						ref={inputRef}
						className="flex h-[28px] w-full rounded-md border-none bg-transparent px-1.5 py-1 text-base placeholder:text-muted-foreground focus-visible:ring-transparent focus-visible:outline-none md:text-sm"
						placeholder={linkMode === "wiki" ? "Search notes..." : "Paste link"}
						value={value}
						data-plate-focus
						onChange={handleChange}
						onBlur={handleBlur}
						onKeyDown={handleKeyDown}
						role="combobox"
						aria-expanded={showSuggestionList || showEmptyState}
						aria-controls={
							showSuggestionList || showEmptyState ? listboxId : undefined
						}
						aria-activedescendant={
							showEmptyState && highlightedIndex >= 0
								? `${listboxId}-empty`
								: showSuggestionList && highlightedIndex >= 0
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
								<div className="space-y-0.5 text-foreground">
									<div
										id={`${listboxId}-empty`}
										role="button"
										tabIndex={0}
										className={cn(
											"relative flex cursor-pointer select-none flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-sm outline-hidden",
											highlightedIndex <= 0
												? "bg-accent text-accent-foreground"
												: "text-foreground",
										)}
										onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
											event.preventDefault()
										}}
										onMouseEnter={() => setHighlightedIndex(0)}
										onClick={handleCreateNote}
									>
										<span className="text-sm font-medium max-w-full flex items-center gap-1.5 truncate">
											<FilePlus className="size-3.5 shrink-0" />
											Create new note "{trimmedValue}"
										</span>
										<span className="text-xs text-muted-foreground max-w-full truncate pl-5">
											{currentRelativeDir}
										</span>
									</div>
								</div>
							) : (
								<div className="space-y-0.5 text-foreground">
									{showRelatedSuggestionList && (
										<div className="px-2 py-1 text-xs text-muted-foreground">
											Related Notes
										</div>
									)}
									{activeSuggestions.map((file, index) => {
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
												<div className="text-sm font-medium max-w-full flex items-center gap-1.5 truncate">
													<FileIcon className="size-3.5 shrink-0" />
													<span className="truncate">{file.displayName}</span>
												</div>
												<span className="text-xs text-muted-foreground max-w-full truncate pl-5">
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

function LinkIcon({ value, linkMode }: { value: string; linkMode: LinkMode }) {
	const trimmed = value.trim()

	if (startsWithHttpProtocol(trimmed)) {
		return <GlobeIcon className="size-4" />
	}

	if (trimmed.length > 0) {
		return <FileIcon className="size-4" />
	}

	// Empty: wiki = note feel, markdown = paste link
	return linkMode === "wiki" ? (
		<FileIcon className="size-4" />
	) : (
		<Link className="size-4" />
	)
}
