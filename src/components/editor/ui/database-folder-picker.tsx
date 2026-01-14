import { ChevronsUpDown, FolderIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useStore } from '@/store'
import type { WorkspaceEntry } from '@/store/workspace/workspace-slice'
import { Button } from '@/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { normalizePathSeparators } from '@/utils/path-utils'

type DirectoryEntry = {
  path: string
  label: string
  relativePath: string
}

interface FolderPickerProps {
  onSelect: (path: string) => void
  currentPath?: string
  workspacePath: string | null
}

function getRelativePath(path: string, workspacePath: string | null) {
  if (!workspacePath) return path
  const relativePath =
    normalizePathSeparators(path.replace(workspacePath, '')) || '.'
  return relativePath === '.' ? '/' : relativePath
}

function collectDirectories(
  entries: WorkspaceEntry[],
  workspacePath: string | null
): DirectoryEntry[] {
  const result: DirectoryEntry[] = []

  function addDirectory(path: string, label: string) {
    result.push({
      path,
      label,
      relativePath: getRelativePath(path, workspacePath),
    })
  }

  function collect(nodes: WorkspaceEntry[]) {
    for (const node of nodes) {
      if (node.isDirectory && node.path) {
        addDirectory(node.path, node.name)
        if (node.children) {
          collect(node.children)
        }
      }
    }
  }

  collect(entries)
  return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

export function FolderPicker({ onSelect, workspacePath }: FolderPickerProps) {
  const [open, setOpen] = useState(false)
  const entries = useStore((state) => state.entries)

  const directories = useMemo(() => {
    return collectDirectories(entries, workspacePath)
  }, [entries, workspacePath])

  const handleSelect = useCallback(
    (path: string) => {
      onSelect(path)
      setOpen(false)
    },
    [onSelect]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className="h-7 justify-between rounded-sm bg-muted/40 px-2 text-xs font-normal text-muted-foreground hover:bg-muted/50 hover:text-foreground ml-1"
        >
          <div className="flex items-center">
            <FolderIcon className="h-3.5 w-3.5" />
          </div>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search folders..." />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No folder found.</CommandEmpty>
            <CommandGroup>
              {directories.map((dir) => (
                <CommandItem
                  key={dir.path}
                  value={dir.path}
                  onSelect={(value) => handleSelect(value)}
                  className="flex items-center gap-2"
                >
                  <FolderIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="flex flex-col truncate">
                    <span className="truncate font-medium">{dir.label}</span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {dir.relativePath}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
