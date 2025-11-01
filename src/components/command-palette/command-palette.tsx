import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useCommandPaletteHotkey } from '@/components/command-palette/hooks/use-command-palette-hotkey'
import { useNoteContentSearch } from '@/components/command-palette/hooks/use-note-content-search'
import {
  stripMarkdownExtension,
  toRelativePath,
  useNoteNameSearch,
} from '@/components/command-palette/hooks/use-note-name-search'
import { highlightQuery } from '@/components/command-palette/utils/highlight-query'
import { getFileNameFromPath } from '@/components/command-palette/utils/path'
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

export function CommandPalette() {
  const entries = useWorkspaceStore((state) => state.entries)
  const workspacePath = useWorkspaceStore((state) => state.workspacePath)
  const openNote = useTabStore((state) => state.openNote)

  const {
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
  } = useUIStore(
    useShallow((state) => ({
      isCommandPaletteOpen: state.isCommandPaletteOpen,
      setCommandPaletteOpen: state.setCommandPaletteOpen,
      openCommandPalette: state.openCommandPalette,
      closeCommandPalette: state.closeCommandPalette,
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

  useCommandPaletteHotkey(
    isCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette
  )

  // Clear the search so the next open starts fresh.
  useEffect(() => {
    if (!isCommandPaletteOpen) {
      setQuery('')
    }
  }, [isCommandPaletteOpen])

  const handleSelectNote = useCallback(
    (notePath: string) => {
      closeCommandPalette()
      openNote(notePath)
    },
    [closeCommandPalette, openNote]
  )

  return (
    <CommandDialog
      open={isCommandPaletteOpen}
      onOpenChange={setCommandPaletteOpen}
      className="bg-popover/90 backdrop-blur-xs"
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
                  <span className="text-muted-foreground text-xs">
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
                    <div className="text-muted-foreground text-xs flex flex-col gap-1">
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
