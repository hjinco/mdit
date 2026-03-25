import { useEditorRef } from "@mdit/editor/plate"
import { Button } from "@mdit/ui/components/button"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@mdit/ui/components/popover"
import { Separator } from "@mdit/ui/components/separator"
import { invoke } from "@tauri-apps/api/core"
import { ArrowRight, InfoIcon } from "lucide-react"
import { resolve } from "pathe"
import { useEffect, useState } from "react"
import { countGraphemes } from "unicode-segmenter/grapheme"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import { calculateReadingMinutes } from "../utils/reading-time"

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
	const [stats, setStats] = useState({ characters: 0, words: 0, minutes: 0 })
	const [backlinks, setBacklinks] = useState<BacklinkEntry[]>([])
	const [relatedNotes, setRelatedNotes] = useState<RelatedNoteEntry[]>([])

	const { tab, workspacePath, openTab, isNoteInfoOpen, setNoteInfoOpen } =
		useStore(
			useShallow((s) => ({
				tab: s.tab,
				workspacePath: s.workspacePath,
				openTab: s.openTab,
				isNoteInfoOpen: s.isNoteInfoOpen,
				setNoteInfoOpen: s.setNoteInfoOpen,
			})),
		)
	const indexingConfig = useStore((s) => s.config)
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: off
	useEffect(() => {
		setRelatedNotes([])
	}, [tab?.path])

	useEffect(() => {
		if (!workspacePath || !tab?.path || !hasEmbeddingConfig) {
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
	}, [workspacePath, tab?.path, hasEmbeddingConfig])

	const handleNoteClick = (relPath: string) => {
		if (!workspacePath) return
		const absolutePath = resolve(workspacePath, relPath)
		openTab(absolutePath)
		setNoteInfoOpen(false)
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
			<PopoverContent className="z-101 w-56 p-3" align="end">
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
										className="group flex w-full items-center justify-between gap-2 px-2 py-1.5 text-xs rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-all text-left"
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
											className="flex-1 text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted transition-colors truncate"
										>
											<span className="truncate">{entry.fileName}</span>
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
