import { invoke } from "@tauri-apps/api/core"
import { ArrowRight, InfoIcon } from "lucide-react"
import { resolve } from "pathe"
import { useEditorRef } from "platejs/react"
import { useEffect, useState } from "react"
import { countGraphemes } from "unicode-segmenter/grapheme"
import { useShallow } from "zustand/shallow"
import { Button } from "@/components/ui/button"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { useStore } from "@/store"

const WORD_SPLIT_REGEX = /\s+/

type BacklinkEntry = {
	relPath: string
	fileName: string
}

export function MoreButton() {
	const editor = useEditorRef()
	const [open, setOpen] = useState(false)
	const [stats, setStats] = useState({ characters: 0, words: 0, minutes: 0 })
	const [backlinks, setBacklinks] = useState<BacklinkEntry[]>([])

	const { tab, workspacePath, openTab } = useStore(
		useShallow((s) => ({
			tab: s.tab,
			workspacePath: s.workspacePath,
			openTab: s.openTab,
		})),
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

	const handleBacklinkClick = (relPath: string) => {
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
										onClick={() => handleBacklinkClick(entry.relPath)}
										className="inline-flex justify-between gap-1 w-full text-left py-1 text-xs rounded text-muted-foreground hover:text-accent-foreground transition-colors cursor-pointer truncate"
										title={entry.relPath}
									>
										{entry.fileName}
										<ArrowRight className="size-3" />
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
