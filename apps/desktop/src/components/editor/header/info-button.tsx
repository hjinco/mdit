import type {
	ResolveWikiLinkParams,
	ResolveWikiLinkResult,
} from "@mdit/editor/plugins/link-kit"
import { exitLinkForwardAtSelection } from "@mdit/editor/utils/link-exit"
import { normalizeWikiTargetForDisplay } from "@mdit/editor/utils/link-toolbar-utils"
import { Button } from "@mdit/ui/components/button"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@mdit/ui/components/popover"
import { Separator } from "@mdit/ui/components/separator"
import { LinkPlugin } from "@platejs/link/react"
import { invoke } from "@tauri-apps/api/core"
import { ArrowRight, InfoIcon, Link2 } from "lucide-react"
import { resolve } from "pathe"
import { KEYS } from "platejs"
import { useEditorPlugin, useEditorRef } from "platejs/react"
import { useEffect, useState } from "react"
import { countGraphemes } from "unicode-segmenter/grapheme"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import { calculateReadingMinutes } from "../utils/reading-time"

async function resolveWikiLinkViaInvoke(
	params: ResolveWikiLinkParams,
): Promise<ResolveWikiLinkResult> {
	return invoke<ResolveWikiLinkResult>("resolve_wiki_link_command", params)
}

const WORD_SPLIT_REGEX = /\s+/

type BacklinkEntry = {
	relPath: string
	fileName: string
}

type RelatedNoteEntry = {
	relPath: string
	fileName: string
}

const RELATED_NOTES_LIMIT = 5

export function InfoButton() {
	const editor = useEditorRef()
	const { api } = useEditorPlugin(LinkPlugin)
	const [stats, setStats] = useState({ characters: 0, words: 0, minutes: 0 })
	const [backlinks, setBacklinks] = useState<BacklinkEntry[]>([])
	const [relatedNotes, setRelatedNotes] = useState<RelatedNoteEntry[]>([])

	const {
		tab,
		workspacePath,
		openTab,
		getIndexingConfig,
		isNoteInfoOpen,
		setNoteInfoOpen,
	} = useStore(
		useShallow((s) => ({
			tab: s.tab,
			workspacePath: s.workspacePath,
			openTab: s.openTab,
			getIndexingConfig: s.getIndexingConfig,
			isNoteInfoOpen: s.isNoteInfoOpen,
			setNoteInfoOpen: s.setNoteInfoOpen,
		})),
	)
	const indexingConfig = useStore((s) =>
		workspacePath ? (s.configs[workspacePath] ?? null) : null,
	)
	const hasEmbeddingConfig = Boolean(
		indexingConfig?.embeddingProvider && indexingConfig?.embeddingModel,
	)

	useEffect(() => {
		if (!editor || !isNoteInfoOpen) {
			return
		}

		const string = editor.api.string([])
		const characters = countGraphemes(string)
		const words = string
			.trim()
			.split(WORD_SPLIT_REGEX)
			.filter((word) => word.length > 0).length
		const minutes = calculateReadingMinutes(words)

		setStats({ characters, words, minutes })
	}, [editor, isNoteInfoOpen])

	useEffect(() => {
		if (!isNoteInfoOpen || !workspacePath || !tab?.path) {
			return
		}

		let cancelled = false
		invoke<BacklinkEntry[]>("get_backlinks_command", {
			workspacePath,
			filePath: tab.path,
		})
			.then((entries) => {
				if (!cancelled) setBacklinks(entries)
			})
			.catch((error) => {
				console.error("Failed to fetch backlinks:", error)
				if (!cancelled) setBacklinks([])
			})

		return () => {
			cancelled = true
		}
	}, [isNoteInfoOpen, workspacePath, tab?.path])

	useEffect(() => {
		if (!isNoteInfoOpen || !workspacePath) {
			return
		}

		getIndexingConfig(workspacePath).catch((error) => {
			console.error("Failed to load indexing config:", error)
		})
	}, [isNoteInfoOpen, workspacePath, getIndexingConfig])

	useEffect(() => {
		if (
			!isNoteInfoOpen ||
			!workspacePath ||
			!tab?.path ||
			!hasEmbeddingConfig
		) {
			setRelatedNotes([])
			return
		}

		let cancelled = false
		invoke<RelatedNoteEntry[]>("get_related_notes_command", {
			workspacePath,
			filePath: tab.path,
			limit: RELATED_NOTES_LIMIT,
		})
			.then((entries) => {
				if (!cancelled) setRelatedNotes(entries)
			})
			.catch((error) => {
				console.error("Failed to fetch related notes:", error)
				if (!cancelled) setRelatedNotes([])
			})

		return () => {
			cancelled = true
		}
	}, [isNoteInfoOpen, workspacePath, tab?.path, hasEmbeddingConfig])

	const handleNoteClick = (relPath: string) => {
		if (!workspacePath) return
		const absolutePath = resolve(workspacePath, relPath)
		openTab(absolutePath)
		setNoteInfoOpen(false)
	}

	const handleInsertWikiLink = async (relPath: string, fileName: string) => {
		if (!workspacePath) {
			return
		}

		const fallbackTarget = normalizeWikiTargetForDisplay(relPath)
		let wikiTarget = fallbackTarget

		try {
			const resolved = await resolveWikiLinkViaInvoke({
				workspacePath,
				currentNotePath: tab?.path ?? null,
				rawTarget: relPath,
			})
			const canonicalTarget = normalizeWikiTargetForDisplay(
				resolved.canonicalTarget,
			)
			wikiTarget = canonicalTarget || fallbackTarget
		} catch (error) {
			console.warn(
				"Failed to resolve related note wiki link; using fallback:",
				error,
			)
		}

		if (!wikiTarget) {
			return
		}

		const linkText = normalizeWikiTargetForDisplay(fileName) || wikiTarget
		editor.tf.insertNodes(
			{
				type: KEYS.link,
				url: wikiTarget,
				wiki: true,
				wikiTarget,
				children: [{ text: linkText }],
			},
			{ select: true },
		)

		const hideFloatingLinkAndFocusEditor = () => {
			api.floatingLink.hide()
			editor.tf.focus()
		}

		const moveSelectionOutsideInsertedLink = () => {
			exitLinkForwardAtSelection(editor, {
				allowFromInsideLink: true,
				focusEditor: false,
				markArrowRightExit: true,
			})
		}

		// Defer selection handling: other UI updates can overwrite selection immediately after insert.
		setTimeout(() => {
			moveSelectionOutsideInsertedLink()
			hideFloatingLinkAndFocusEditor()
		}, 0)
	}

	return (
		<Popover open={isNoteInfoOpen} onOpenChange={setNoteInfoOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="text-foreground/70"
					aria-label="Note info"
					title="Note info"
				>
					<InfoIcon />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-64 z-101 p-3" align="end">
				<div className="space-y-1 text-xs">
					<div className="flex justify-between items-center">
						<span className="text-muted-foreground">Characters</span>
						<span>{stats.characters}</span>
					</div>
					<div className="flex justify-between items-center">
						<span className="text-muted-foreground">Words</span>
						<span>{stats.words}</span>
					</div>
					<div className="flex justify-between items-center">
						<span className="text-muted-foreground">Reading Time</span>
						<span>{stats.minutes} min</span>
					</div>
				</div>

				{backlinks.length > 0 && (
					<>
						<Separator className="my-3" />
						<div>
							<div className="text-muted-foreground text-xs mb-1">
								Backlinks
							</div>
							<div>
								{backlinks.map((entry) => (
									<button
										type="button"
										key={entry.relPath}
										onClick={() => handleNoteClick(entry.relPath)}
										className="group flex w-full items-center justify-between gap-2 px-2 py-1.5 text-xs rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer text-left"
										title={entry.relPath}
									>
										<span className="truncate">{entry.fileName}</span>
										<ArrowRight className="size-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
									</button>
								))}
							</div>
						</div>
					</>
				)}
				{relatedNotes.length > 0 && (
					<>
						<Separator className="my-3" />
						<div>
							<div className="text-muted-foreground text-xs mb-1">
								Related Notes
							</div>
							<div>
								{relatedNotes.map((entry) => (
									<div
										key={entry.relPath}
										className="group flex items-center justify-between"
										title={entry.relPath}
									>
										<button
											type="button"
											onClick={() => handleNoteClick(entry.relPath)}
											className="flex-1 text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted transition-colors cursor-pointer truncate"
										>
											<span className="truncate">{entry.fileName}</span>
										</button>
										<button
											type="button"
											onClick={() => {
												void handleInsertWikiLink(entry.relPath, entry.fileName)
											}}
											onMouseDown={(event) => {
												event.preventDefault()
											}}
											className="inline-flex shrink-0 h-7 px-1.75 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
											aria-label={`Link ${entry.fileName} to current note`}
											title="Link to current note"
										>
											<Link2 className="size-3.5" />
										</button>
									</div>
								))}
							</div>
						</div>
					</>
				)}
			</PopoverContent>
		</Popover>
	)
}
