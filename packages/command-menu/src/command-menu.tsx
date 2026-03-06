import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@mdit/ui/components/command"
import { useDebounce } from "@mdit/ui/hooks/use-debounce"
import { motion } from "motion/react"
import { useCallback, useDeferredValue, useEffect, useState } from "react"
import useMeasure from "react-use-measure"
import { highlightQuery } from "./highlight-query"
import { getFileNameFromPath, stripMarkdownExtension } from "./path-utils"
import type {
	CommandMenuContentSearch,
	CommandMenuEntry,
	CommandMenuSemanticSearch,
} from "./types"
import { useNoteContentSearch } from "./use-note-content-search"
import { toRelativePath, useNoteNameSearch } from "./use-note-name-search"
import { useSemanticSearch } from "./use-semantic-search"

export type CommandMenuProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	workspacePath: string | null
	entries: CommandMenuEntry[]
	onSelectPath: (path: string) => void
	searchContent?: CommandMenuContentSearch
	searchSemantic?: CommandMenuSemanticSearch
}

export function CommandMenu({
	open,
	onOpenChange,
	workspacePath,
	entries,
	onSelectPath,
	searchContent,
	searchSemantic,
}: CommandMenuProps) {
	const [query, setQuery] = useState("")
	const [isInitialMeasureDebounced, setIsInitialMeasureDebounced] =
		useState(false)
	const deferredQuery = useDeferredValue(query)
	const debouncedQuery = useDebounce(query, 250)
	const { filteredNoteResults, noteResultsByPath } = useNoteNameSearch(
		entries,
		workspacePath,
		deferredQuery,
	)
	const { trimmedSearchTerm, contentMatchesByNote } = useNoteContentSearch(
		debouncedQuery,
		workspacePath,
		searchContent,
	)
	const { results: semanticResults } = useSemanticSearch(
		debouncedQuery,
		workspacePath,
		searchSemantic,
	)

	const hasNoteMatches = filteredNoteResults.length > 0
	const hasContentMatches = contentMatchesByNote.length > 0
	const hasSemanticMatches = semanticResults.length > 0

	useEffect(() => {
		if (!open) {
			const timeout = window.setTimeout(() => {
				setQuery("")
			}, 250)

			return () => {
				window.clearTimeout(timeout)
			}
		}
	}, [open])

	const handleSelectNote = useCallback(
		(notePath: string) => {
			onOpenChange(false)
			onSelectPath(notePath)
		},
		[onOpenChange, onSelectPath],
	)

	const [listRef, listBounds] = useMeasure({
		debounce: isInitialMeasureDebounced ? 220 : 0,
	})

	useEffect(() => {
		if (!open) {
			setIsInitialMeasureDebounced(false)
			return
		}

		setIsInitialMeasureDebounced(true)

		const timeout = window.setTimeout(() => {
			setIsInitialMeasureDebounced(false)
		}, 220)

		return () => {
			window.clearTimeout(timeout)
		}
	}, [open])

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			className="bg-popover/90 top-[20%] translate-y-0 backdrop-blur-xs sm:max-w-2xl"
			commandProps={{
				className: "bg-transparent",
				shouldFilter: false,
			}}
			showCloseButton={false}
		>
			<CommandInput
				value={query}
				onValueChange={setQuery}
				placeholder="Search notes..."
				autoFocus
			/>
			<motion.div
				style={{ overflow: "hidden" }}
				initial={false}
				animate={listBounds.height ? { height: listBounds.height } : {}}
				transition={{ ease: "easeOut", duration: 0.1 }}
			>
				<CommandList ref={listRef} className="max-h-88">
					<CommandEmpty>No results found</CommandEmpty>
					{hasNoteMatches && (
						<CommandGroup
							heading={deferredQuery.trim() ? "Notes" : "Recent Notes"}
						>
							{filteredNoteResults.map((note) => (
								<CommandItem
									key={note.path}
									value={note.path}
									keywords={note.keywords}
									onSelect={() => handleSelectNote(note.path)}
									className="data-[selected=true]:bg-accent-foreground/10"
								>
									<div className="flex flex-col">
										<span>{note.label}</span>
										<span className="text-muted-foreground/80 text-xs">
											{note.relativePath}
										</span>
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					)}
					{hasSemanticMatches && (
						<CommandGroup heading="Suggestions">
							{semanticResults.slice(0, 5).map((result) => {
								const note = noteResultsByPath.get(result.path)
								const label =
									note?.label ||
									stripMarkdownExtension(result.name).trim() ||
									result.name
								const relativePath =
									note?.relativePath ??
									toRelativePath(result.path, workspacePath)
								const keywords = [label, relativePath, "semantic", "ai"].filter(
									Boolean,
								) as string[]

								return (
									<CommandItem
										key={`${result.path}:semantic`}
										value={`${result.path}:semantic`}
										keywords={keywords}
										onSelect={() => handleSelectNote(result.path)}
										className="data-[selected=true]:bg-accent-foreground/10"
									>
										<div className="flex max-w-full flex-col gap-0.5">
											<div className="flex items-center gap-2 truncate text-sm">
												<span className="truncate">{label}</span>
											</div>
											<span className="text-muted-foreground/80 truncate text-xs">
												{relativePath}
											</span>
										</div>
									</CommandItem>
								)
							})}
						</CommandGroup>
					)}
					{hasContentMatches && (
						<CommandGroup heading="Content Matches">
							{contentMatchesByNote.map((group) => {
								const note = noteResultsByPath.get(group.path)
								const label =
									note?.label ??
									stripMarkdownExtension(getFileNameFromPath(group.path))
								const relativePath =
									note?.relativePath ??
									toRelativePath(group.path, workspacePath)
								const keywords = [
									label,
									relativePath,
									...group.matches.flatMap((match) => [
										match.snippet || "(empty line)",
										match.lineText,
									]),
								].filter(Boolean) as string[]

								return (
									<CommandItem
										key={group.path}
										value={`${group.path}:content`}
										keywords={keywords}
										onSelect={() => handleSelectNote(group.path)}
										className="data-[selected=true]:bg-accent-foreground/10"
									>
										<div className="flex flex-col gap-1">
											<span>{label}</span>
											<div className="text-muted-foreground/80 flex flex-col gap-1 text-[11px]">
												{group.matches.map((match) => (
													<span key={`${group.path}:${match.lineNumber}`}>
														{highlightQuery(
															match.snippet || "(empty line)",
															trimmedSearchTerm,
														)}
													</span>
												))}
											</div>
											<span className="text-muted-foreground text-xs">
												{relativePath}
											</span>
										</div>
									</CommandItem>
								)
							})}
						</CommandGroup>
					)}
				</CommandList>
			</motion.div>
		</CommandDialog>
	)
}
