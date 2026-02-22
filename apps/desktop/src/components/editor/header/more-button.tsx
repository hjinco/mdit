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
import { useEditorRef } from "platejs/react"
import { useEffect, useState } from "react"
import { countGraphemes } from "unicode-segmenter/grapheme"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

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

export function MoreButton() {
	const editor = useEditorRef()
	const [open, setOpen] = useState(false)
	const [stats, setStats] = useState({ characters: 0, words: 0, minutes: 0 })
	const [backlinks, setBacklinks] = useState<BacklinkEntry[]>([])
	const [relatedNotes, setRelatedNotes] = useState<RelatedNoteEntry[]>([])

	const { tab, workspacePath, openTab, getIndexingConfig } = useStore(
		useShallow((s) => ({
			tab: s.tab,
			workspacePath: s.workspacePath,
			openTab: s.openTab,
			getIndexingConfig: s.getIndexingConfig,
		})),
	)
	const indexingConfig = useStore((s) =>
		workspacePath ? (s.configs[workspacePath] ?? null) : null,
	)
	const hasEmbeddingConfig = Boolean(
		indexingConfig?.embeddingProvider && indexingConfig?.embeddingModel,
	)

	useEffect(() => {
		if (!editor || !open) {
			return
		}

		const string = editor.api.string([])
		const characters = countGraphemes(string)
		const words = string
			.trim()
			.split(WORD_SPLIT_REGEX)
			.filter((word) => word.length > 0).length
		const wordsPerMinute = 300
		const minutes = Math.round(words / wordsPerMinute)

		setStats({ characters, words, minutes })
	}, [editor, open])

	useEffect(() => {
		if (!open || !workspacePath || !tab?.path) {
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
	}, [open, workspacePath, tab?.path])

	useEffect(() => {
		if (!open || !workspacePath) {
			return
		}

		getIndexingConfig(workspacePath).catch((error) => {
			console.error("Failed to load indexing config:", error)
		})
	}, [open, workspacePath, getIndexingConfig])

	useEffect(() => {
		if (!open || !workspacePath || !tab?.path || !hasEmbeddingConfig) {
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
	}, [open, workspacePath, tab?.path, hasEmbeddingConfig])

	const handleNoteClick = (relPath: string) => {
		if (!workspacePath) return
		const absolutePath = resolve(workspacePath, relPath)
		openTab(absolutePath)
		setOpen(false)
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="icon" className="text-foreground/70">
					<InfoIcon />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-48 z-101" align="end">
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
						<div className="space-y-1">
							<div className="text-muted-foreground text-xs mb-1">
								Backlinks
							</div>
							<div className="space-y-0.5">
								{backlinks.map((entry) => (
									<button
										type="button"
										key={entry.relPath}
										onClick={() => handleNoteClick(entry.relPath)}
										className="inline-flex justify-between gap-1 w-full text-left py-1 text-xs rounded text-muted-foreground hover:text-accent-foreground transition-colors cursor-pointer truncate"
										title={entry.relPath}
									>
										<span className="truncate">{entry.fileName}</span>
										<ArrowRight className="size-3 shrink-0" />
									</button>
								))}
							</div>
						</div>
					</>
				)}
				{relatedNotes.length > 0 && (
					<>
						<Separator className="my-3" />
						<div className="space-y-1">
							<div className="text-muted-foreground text-xs mb-1">
								Related Notes
							</div>
							<div className="space-y-0.5">
								{relatedNotes.map((entry) => (
									<button
										type="button"
										key={entry.relPath}
										onClick={() => handleNoteClick(entry.relPath)}
										className="inline-flex justify-between gap-1 w-full text-left py-1 text-xs rounded text-muted-foreground hover:text-accent-foreground transition-colors cursor-pointer truncate"
										title={entry.relPath}
									>
										<span className="truncate">{entry.fileName}</span>
										<ArrowRight className="size-3 shrink-0" />
									</button>
								))}
							</div>
						</div>
					</>
				)}
			</PopoverContent>
		</Popover>
	)
}
