import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useDebounce } from '@/hooks/use-debounce'
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
import { useCommandMenuHotkey } from './hooks/use-command-menu-hotkey'
import { useNoteContentSearch } from './hooks/use-note-content-search'
import {
  stripMarkdownExtension,
  toRelativePath,
  useNoteNameSearch,
} from './hooks/use-note-name-search'
import { highlightQuery } from './utils/highlight-query'
import { getFileNameFromPath } from './utils/path'

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
  // Debounce intensive lookups so we only search once a user pauses typing.
  const debouncedQuery = useDebounce(query, 300)
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
  // Local filtering keeps the command palette fast even with thousands of files.
  const hasNoteMatches = filteredNoteResults.length > 0
  const hasContentMatches = contentMatchesByNote.length > 0
  const hasAnyMatches = hasNoteMatches || hasContentMatches

  useCommandMenuHotkey(isCommandMenuOpen, openCommandMenu, closeCommandMenu)

  // Clear the search so the next open starts fresh.
  useEffect(() => {
    if (!isCommandMenuOpen) {
      setQuery('')
    }
  }, [isCommandMenuOpen])

  const handleSelectNote = useCallback(
    (notePath: string) => {
      closeCommandMenu()
      openNote(notePath)
    },
    [closeCommandMenu, openNote]
  )

  return (
    <CommandDialog
      open={isCommandMenuOpen}
      onOpenChange={setCommandMenuOpen}
      className="bg-popover/90 backdrop-blur-xs top-[20%] translate-y-0"
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
      <CommandList>
        {!hasAnyMatches && <CommandEmpty>No results found</CommandEmpty>}
        {hasNoteMatches && (
          <CommandGroup heading="Notes">
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
                note?.relativePath ?? toRelativePath(group.path, workspacePath)
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
      </CommandList>
    </CommandDialog>
  )
}
