import { motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import useMeasure from 'react-use-measure'
import { useShallow } from 'zustand/shallow'
import { useDebounce } from '@/hooks/use-debounce'
import { useSemanticNoteSearch } from '@/hooks/use-semantic-note-search'
import { useTabStore } from '@/store/tab-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/ui/command'
import { getFileNameFromPath } from '@/utils/path-utils'
import { useCommandMenuHotkey } from './hooks/use-command-menu-hotkey'
import { useNoteContentSearch } from './hooks/use-note-content-search'
import {
  stripMarkdownExtension,
  toRelativePath,
  useNoteNameSearch,
} from './hooks/use-note-name-search'
import { highlightQuery } from './utils/highlight-query'

export function CommandMenu() {
  const entries = useWorkspaceStore((state) => state.entries)
  const workspacePath = useWorkspaceStore((state) => state.workspacePath)
  const openNote = useTabStore((state) => state.openNote)

  const {
    isCommandMenuOpen,
    setCommandMenuOpen,
    openCommandMenu,
    closeCommandMenu,
  } = useUIStore(
    useShallow((state) => ({
      isCommandMenuOpen: state.isCommandMenuOpen,
      setCommandMenuOpen: state.setCommandMenuOpen,
      openCommandMenu: state.openCommandMenu,
      closeCommandMenu: state.closeCommandMenu,
    }))
  )

  const [query, setQuery] = useState('')
  const [isInitialMeasureDebounced, setIsInitialMeasureDebounced] =
    useState(false)
  // Debounce intensive lookups so we only search once a user pauses typing.
  const debouncedQuery = useDebounce(query, 250)
  // Build an index of notes in the workspace and pre-filter by the current search.
  const { filteredNoteResults, noteResultsByPath } = useNoteNameSearch(
    entries,
    workspacePath,
    debouncedQuery
  )
  // Search across note contents (slow path) and keep contextual snippets for display.
  const { trimmedSearchTerm, contentMatchesByNote } = useNoteContentSearch(
    debouncedQuery,
    workspacePath
  )
  const { results: semanticResults } = useSemanticNoteSearch(
    debouncedQuery,
    workspacePath
  )
  // Local filtering keeps the command palette fast even with thousands of files.
  const hasNoteMatches = filteredNoteResults.length > 0
  const hasContentMatches = contentMatchesByNote.length > 0
  const hasSemanticMatches = semanticResults.length > 0

  useCommandMenuHotkey(isCommandMenuOpen, openCommandMenu, closeCommandMenu)

  // Clear the search so the next open starts fresh.
  // Delay clearing to avoid showing placeholder during close animation
  useEffect(() => {
    if (!isCommandMenuOpen) {
      const timeout = setTimeout(() => {
        setQuery('')
      }, 250)
      return () => {
        clearTimeout(timeout)
      }
    }
  }, [isCommandMenuOpen])

  const handleSelectNote = useCallback(
    (notePath: string) => {
      closeCommandMenu()
      openNote(notePath)
    },
    [closeCommandMenu, openNote]
  )

  const [listRef, listBounds] = useMeasure({
    debounce: isInitialMeasureDebounced ? 220 : 0,
  })

  useEffect(() => {
    if (!isCommandMenuOpen) {
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
  }, [isCommandMenuOpen])

  return (
    <CommandDialog
      open={isCommandMenuOpen}
      onOpenChange={setCommandMenuOpen}
      className="bg-popover/90 backdrop-blur-xs top-[20%] translate-y-0 sm:max-w-2xl"
      commandProps={{
        className: 'bg-transparent',
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
        style={{ overflow: 'hidden' }}
        initial={false}
        animate={listBounds.height ? { height: listBounds.height } : {}}
        transition={{ ease: 'easeOut', duration: 0.1 }}
      >
        <CommandList ref={listRef} className="max-h-88">
          <CommandEmpty>No results found</CommandEmpty>
          {hasNoteMatches && (
            <CommandGroup
              heading={debouncedQuery.trim() ? 'Notes' : 'Recent Notes'}
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
                    match.snippet || '(empty line)',
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
                      <div className="text-muted-foreground/80 text-[11px] flex flex-col gap-1">
                        {group.matches.map((match) => (
                          <span key={`${group.path}:${match.lineNumber}`}>
                            {highlightQuery(
                              match.snippet || '(empty line)',
                              trimmedSearchTerm
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
          {hasSemanticMatches && (
            <CommandGroup heading="AI Suggestions">
              {semanticResults.map((result) => {
                const note = noteResultsByPath.get(result.path)
                const label =
                  note?.label ??
                  stripMarkdownExtension(result.name) ??
                  result.name
                const relativePath =
                  note?.relativePath ??
                  toRelativePath(result.path, workspacePath)
                const keywords = [label, relativePath, 'semantic', 'ai'].filter(
                  Boolean
                ) as string[]

                return (
                  <CommandItem
                    key={`${result.path}:semantic`}
                    value={`${result.path}:semantic`}
                    keywords={keywords}
                    onSelect={() => handleSelectNote(result.path)}
                    className="data-[selected=true]:bg-accent-foreground/10"
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="truncate">{label}</span>
                      </div>
                      <span className="text-muted-foreground/80 text-xs">
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
