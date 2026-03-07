import { Command } from "@mdit/ui/components/command"
import { Input } from "@mdit/ui/components/input"
import { cn } from "@mdit/ui/lib/utils"
import { XIcon } from "lucide-react"
import {
	type KeyboardEvent,
	type MouseEvent,
	useMemo,
	useRef,
	useState,
} from "react"
import type { LinkWorkspaceState } from "../link/link-kit-types"
import { flattenWorkspaceFiles } from "../link/link-toolbar-utils"
import {
	handleTagClick,
	handleTagMouseDown,
	type TagHostDeps,
} from "../tag/node-tag"
import {
	formatFrontmatterTagLabel,
	getFrontmatterTagQuery,
	normalizeFrontmatterTagItems,
} from "./frontmatter-tag-utils"
import { FrontmatterWikiInlinePreview } from "./frontmatter-wiki-inline-preview"
import {
	getActiveFrontmatterWikiQuery,
	replaceFrontmatterWikiQuery,
} from "./frontmatter-wiki-link-utils"
import {
	type ResolveFrontmatterWikiLinkTarget,
	resolveFrontmatterWikiLinks,
} from "./frontmatter-wiki-resolve-utils"
import { FrontmatterWikiSuggestionPopover } from "./frontmatter-wiki-suggestion-popover"
import {
	buildFrontmatterWikiSuggestions,
	type FrontmatterWikiSuggestionEntry,
	getFrontmatterWikiSuggestionTargetKey,
} from "./frontmatter-wiki-suggestion-utils"
import type { FocusRegistration } from "./node-frontmatter-table"

type FrontmatterArrayProps = {
	value: unknown
	onChange: (nextValue: string[]) => void
	placeholder?: string
	mode?: "array" | "tags"
	focusRegistration?: FocusRegistration
	onOpenWikiLink?: (target: string) => void | Promise<void>
	onOpenTagSearch?: TagHostDeps["openTagSearch"]
	getLinkWorkspaceState?: () => LinkWorkspaceState
	resolveWikiLinkTarget?: ResolveFrontmatterWikiLinkTarget
}

const parseItems = (raw: string) =>
	raw
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)

export function FrontmatterArray({
	value,
	onChange,
	placeholder = "Type and press Enter",
	mode = "array",
	focusRegistration,
	onOpenWikiLink,
	onOpenTagSearch,
	getLinkWorkspaceState,
	resolveWikiLinkTarget,
}: FrontmatterArrayProps) {
	const isTagMode = mode === "tags"
	const [draft, setDraft] = useState("")
	const [cursorPosition, setCursorPosition] = useState(0)
	const inputRef = useRef<HTMLInputElement | null>(null)
	const wikiPopoverAnchorRef = useRef<HTMLDivElement | null>(null)
	const linkWorkspaceState = isTagMode ? undefined : getLinkWorkspaceState?.()
	const workspaceFiles = useMemo(
		() =>
			flattenWorkspaceFiles(
				linkWorkspaceState?.entries ?? [],
				linkWorkspaceState?.workspacePath ?? null,
			),
		[linkWorkspaceState?.entries, linkWorkspaceState?.workspacePath],
	)
	const activeWikiQuery = useMemo(
		() =>
			isTagMode ? null : getActiveFrontmatterWikiQuery(draft, cursorPosition),
		[cursorPosition, draft, isTagMode],
	)

	const items = useMemo(() => {
		if (isTagMode) {
			return normalizeFrontmatterTagItems(value)
		}
		if (Array.isArray(value)) {
			return value.map((item) => String(item ?? "").trim()).filter(Boolean)
		}
		if (typeof value === "string") {
			return parseItems(value)
		}
		return []
	}, [isTagMode, value])
	const excludedWikiTargetKeys = useMemo(() => {
		if (isTagMode) {
			return new Set<string>()
		}
		const targetKeys = new Set<string>()
		for (const item of items) {
			const key = getFrontmatterWikiSuggestionTargetKey(item)
			if (key) {
				targetKeys.add(key)
			}
		}
		return targetKeys
	}, [isTagMode, items])
	const wikiSuggestions = useMemo(() => {
		if (isTagMode || !activeWikiQuery) return []
		return buildFrontmatterWikiSuggestions(
			workspaceFiles,
			activeWikiQuery.query,
			{
				excludeTargetKeys: excludedWikiTargetKeys,
			},
		)
	}, [activeWikiQuery, excludedWikiTargetKeys, isTagMode, workspaceFiles])
	const showWikiSuggestionPopover =
		!isTagMode && Boolean(activeWikiQuery) && wikiSuggestions.length > 0
	const tagHost = useMemo<TagHostDeps | undefined>(
		() =>
			onOpenTagSearch
				? {
						openTagSearch: onOpenTagSearch,
					}
				: undefined,
		[onOpenTagSearch],
	)

	const addItems = (raw: string) => {
		const nextItems = parseItems(raw)
		if (!nextItems.length) return
		const applyItems = (resolvedItems: string[]) => {
			const nextResolvedItems = isTagMode
				? normalizeFrontmatterTagItems(resolvedItems)
				: resolvedItems
			const merged = [...items]
			for (const item of nextResolvedItems) {
				if (!merged.includes(item)) {
					merged.push(item)
				}
			}
			onChange(merged)
			setDraft("")
		}

		if (isTagMode || !resolveWikiLinkTarget) {
			applyItems(nextItems)
			return
		}

		void Promise.all(
			nextItems.map((item) =>
				resolveFrontmatterWikiLinks(item, resolveWikiLinkTarget),
			),
		).then((resolvedItems) => {
			applyItems(resolvedItems)
		})
	}

	const removeItem = (index: number) => {
		const next = items.filter((_, i) => i !== index)
		onChange(next)
	}

	const applyWikiSuggestion = (suggestion: FrontmatterWikiSuggestionEntry) => {
		if (!activeWikiQuery) return
		const nextDraft = replaceFrontmatterWikiQuery(
			draft,
			activeWikiQuery,
			suggestion.target,
		)
		addItems(nextDraft)
		setCursorPosition(0)
		requestAnimationFrame(() => {
			const input = inputRef.current
			if (!input) return
			input.focus()
			input.setSelectionRange(0, 0)
		})
	}

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		const isCommandNavigationKey =
			showWikiSuggestionPopover &&
			(event.key === "ArrowDown" ||
				event.key === "ArrowUp" ||
				event.key === "Enter")
		if (isCommandNavigationKey) {
			return
		}

		if (event.key === "Enter" || event.key === ",") {
			event.preventDefault()
			addItems(draft)
			return
		}

		if (event.key === "Backspace" && !draft && items.length) {
			event.preventDefault()
			removeItem(items.length - 1)
		}
	}

	return (
		<Command
			loop
			shouldFilter={false}
			className="h-auto w-full overflow-visible rounded-none bg-transparent text-inherit"
		>
			<div
				ref={wikiPopoverAnchorRef}
				className="relative flex min-h-8 w-full flex-wrap items-center gap-2 bg-background"
				onClick={() => inputRef.current?.focus()}
			>
				{items.map((item, index) => (
					<span
						key={`${item}-${index}`}
						className={cn(
							"group inline-flex items-center gap-1 rounded-sm px-2 py-1 text-sm",
							isTagMode && getFrontmatterTagQuery(item)
								? "bg-brand/10 text-brand"
								: "bg-muted text-foreground",
						)}
					>
						{isTagMode ? (
							<button
								type="button"
								className={cn(
									"max-w-[12rem] truncate rounded-sm text-left",
									getFrontmatterTagQuery(item)
										? "cursor-pointer hover:bg-brand/18"
										: "cursor-default",
								)}
								title={formatFrontmatterTagLabel(item)}
								onMouseDown={(event: MouseEvent<HTMLButtonElement>) =>
									handleTagMouseDown(
										event,
										tagHost,
										getFrontmatterTagQuery(item) ?? undefined,
									)
								}
								onClick={(event: MouseEvent<HTMLButtonElement>) =>
									handleTagClick(
										event,
										tagHost,
										getFrontmatterTagQuery(item) ?? undefined,
									)
								}
							>
								{formatFrontmatterTagLabel(item)}
							</button>
						) : (
							<span className="max-w-[12rem] truncate" title={item}>
								<FrontmatterWikiInlinePreview
									value={item}
									onOpenWikiLink={onOpenWikiLink}
								/>
							</span>
						)}
						<button
							type="button"
							className="rounded-sm py-0.5 text-muted-foreground transition-colors hover:text-destructive cursor-pointer"
							onClick={(event) => {
								event.stopPropagation()
								removeItem(index)
								inputRef.current?.focus()
							}}
							aria-label={`Remove ${item}`}
							tabIndex={-1}
						>
							<XIcon className="h-3 w-3" />
						</button>
					</span>
				))}
				<Input
					ref={(node) => {
						inputRef.current = node
						focusRegistration?.register(node)
					}}
					data-row-id={focusRegistration?.rowId}
					data-col-id={focusRegistration?.columnId}
					value={draft}
					onChange={(event) => {
						setDraft(event.target.value)
						setCursorPosition(
							event.target.selectionStart ?? event.target.value.length,
						)
					}}
					onClick={(event) => {
						setCursorPosition(
							event.currentTarget.selectionStart ??
								event.currentTarget.value.length,
						)
					}}
					onSelect={(event) => {
						setCursorPosition(
							event.currentTarget.selectionStart ??
								event.currentTarget.value.length,
						)
					}}
					onKeyDown={handleKeyDown}
					placeholder={items.length ? "" : placeholder}
					className={cn(
						"flex-1 min-w-[120px] border-none px-2 shadow-none focus-visible:ring-0 focus-visible:border-0 bg-transparent dark:bg-transparent focus-visible:outline-none",
						"rounded-sm data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px]",
					)}
				/>
				{showWikiSuggestionPopover && (
					<FrontmatterWikiSuggestionPopover
						anchor={wikiPopoverAnchorRef.current}
						suggestions={wikiSuggestions}
						onSelect={applyWikiSuggestion}
					/>
				)}
			</div>
		</Command>
	)
}
