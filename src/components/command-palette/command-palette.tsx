import { useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useTabStore } from '@/store/tab-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore, type WorkspaceEntry } from '@/store/workspace-store'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/ui/command'

type NoteResult = {
  path: string
  label: string
  relativePath: string
  keywords: string[]
}

const MARKDOWN_EXTENSION_REGEX = /\.md$/i

const isMarkdownFile = (entry: WorkspaceEntry) =>
  !entry.isDirectory && MARKDOWN_EXTENSION_REGEX.test(entry.name)

const stripMarkdownExtension = (name: string) =>
  name.replace(MARKDOWN_EXTENSION_REGEX, '')

const toRelativePath = (fullPath: string, workspacePath: string | null) => {
  if (!workspacePath) {
    return fullPath
  }

  if (fullPath === workspacePath) {
    return fullPath
  }

  if (fullPath.startsWith(workspacePath)) {
    const separator = fullPath.charAt(workspacePath.length)
    if (separator === '/' || separator === '\\') {
      return fullPath.slice(workspacePath.length + 1)
    }
    return fullPath.slice(workspacePath.length)
  }

  return fullPath
}

const RELATIVE_PATH_SEGMENT_REGEX = /[/\\]/

const collectNotes = (
  entries: WorkspaceEntry[],
  workspacePath: string | null
) => {
  const results: NoteResult[] = []

  const traverse = (nodes: WorkspaceEntry[]) => {
    for (const node of nodes) {
      if (isMarkdownFile(node)) {
        const label = stripMarkdownExtension(node.name).trim() || node.name
        const relativePath = toRelativePath(node.path, workspacePath)
        const relativePathWithoutExtension =
          stripMarkdownExtension(relativePath)
        const relativeSegments = relativePath
          .split(RELATIVE_PATH_SEGMENT_REGEX)
          .map((segment) => stripMarkdownExtension(segment).trim())
          .filter((segment) => segment.length > 0)
        const keywords = Array.from(
          new Set([
            label,
            relativePath,
            relativePathWithoutExtension,
            ...relativeSegments,
          ])
        )

        results.push({
          path: node.path,
          label,
          relativePath,
          keywords,
        })
      }

      if (node.children?.length) {
        traverse(node.children)
      }
    }
  }

  traverse(entries)

  return results.sort((a, b) => a.label.localeCompare(b.label))
}

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

  const [searchValue, setSearchValue] = useState('')

  const noteResults = useMemo(
    () => collectNotes(entries, workspacePath),
    [entries, workspacePath]
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return
      }

      if (!(event.metaKey || event.ctrlKey)) {
        return
      }

      if (event.key.toLowerCase() !== 'p') {
        return
      }

      event.preventDefault()
      if (isCommandPaletteOpen) {
        closeCommandPalette()
      } else {
        openCommandPalette()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [closeCommandPalette, isCommandPaletteOpen, openCommandPalette])

  useEffect(() => {
    if (!isCommandPaletteOpen) {
      setSearchValue('')
    }
  }, [isCommandPaletteOpen])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setCommandPaletteOpen(open)
    },
    [setCommandPaletteOpen]
  )

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
      onOpenChange={handleOpenChange}
      className="bg-popover/80 backdrop-blur-xs"
      commandProps={{
        value: searchValue,
        onValueChange: setSearchValue,
        className: 'bg-transparent',
      }}
      showCloseButton={false}
    >
      <CommandInput placeholder="Search notes..." autoFocus />
      <CommandList>
        <CommandEmpty>No notes found.</CommandEmpty>
        {noteResults.length > 0 && (
          <CommandGroup heading="Notes">
            {noteResults.map((note) => (
              <CommandItem
                key={note.path}
                value={note.path}
                keywords={note.keywords}
                onSelect={() => handleSelectNote(note.path)}
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
      </CommandList>
    </CommandDialog>
  )
}
