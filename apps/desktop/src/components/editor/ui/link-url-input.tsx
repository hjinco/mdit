import { buttonVariants } from "@mdit/ui/components/button"
import { cn } from "@mdit/ui/lib/utils"
import { upsertLink } from "@platejs/link"
import { LinkPlugin } from "@platejs/link/react"
import { cva } from "class-variance-authority"
import { Check, FileIcon, GlobeIcon, Link } from "lucide-react"
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
import { useShallow } from "zustand/shallow"
import { startsWithHttpProtocol } from "@/components/editor/utils/link-utils"
import { useStore } from "@/store"
import {
	createPathQueryCandidates,
	ensureUriEncoding,
	flattenWorkspaceFiles,
	type LinkMode,
	normalizeMarkdownPathForDisplay,
	normalizePathSeparators,
	normalizeWikiTargetForDisplay,
	parseInternalLinkTarget,
	resolveInternalLinkPath,
	resolveWikiLinkViaInvoke,
	safelyDecodeUrl,
	stripCurrentDirectoryPrefix,
	stripLeadingSlashes,
	toWorkspaceRelativeWikiTarget,
	type WorkspaceFileOption,
} from "./link-toolbar-utils"

const modeButtonVariants = cva("h-6 px-2 text-xs")
const MAX_SUGGESTIONS = 50

type SearchableWorkspaceFile = {
	file: WorkspaceFileOption
	displayNameLower: string
	relativePathLower: string
	relativeToTabLower: string | null
}

export function LinkUrlInput({
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

			if (!exactMatchFound && exactQueryCandidates.has(relativePathLower)) {
				exactMatchFound = true
			}

			if (
				!exactMatchFound &&
				relativeToTabLower &&
				exactQueryCandidates.has(relativeToTabLower)
			) {
				exactMatchFound = true
			}

			if (suggestions.length < MAX_SUGGESTIONS) {
				if (matchesRelativePath) {
					suggestions.push(file)
				} else if (
					displayNameQuery &&
					displayNameLower.includes(displayNameQuery)
				) {
					suggestions.push(file)
				} else if (
					relativeToTabLower &&
					pathQueryCandidates.some((candidate) =>
						relativeToTabLower.includes(candidate),
					)
				) {
					suggestions.push(file)
				}
			}
		}

		return { hasExactMatch: exactMatchFound, suggestions }
	}, [deferredQuery, searchableSuggestions, suggestionsEnabled])

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
