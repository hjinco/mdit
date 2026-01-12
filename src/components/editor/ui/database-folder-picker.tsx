import { FolderIcon, SearchIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useWorkspaceStore, type WorkspaceEntry } from '@/store/workspace-store'
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
import {
  getFolderNameFromPath,
  normalizePathSeparators,
} from '@/utils/path-utils'

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

function resolveSelectedFolder(
  currentPath: string | undefined,
  directories: DirectoryEntry[]
) {
  if (!currentPath) return null
  return (
    directories.find((dir) => dir.path === currentPath) || {
      path: currentPath,
      label: getFolderNameFromPath(currentPath),
      relativePath: currentPath,
    }
  )
}

export function FolderPicker({
  onSelect,
  currentPath,
  workspacePath,
}: FolderPickerProps) {
  const [open, setOpen] = useState(false)
  const entries = useWorkspaceStore((state) => state.entries)

  const directories = useMemo(() => {
    return collectDirectories(entries, workspacePath)
  }, [entries, workspacePath])

  const selectedFolder = useMemo(() => {
    return resolveSelectedFolder(currentPath, directories)
  }, [currentPath, directories])

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
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 justify-between px-2 font-normal text-muted-foreground hover:text-foreground"
        >
          <div className="flex items-center gap-2 truncate">
            <FolderIcon className="h-3.5 w-3.5" />
            <span className="truncate">
              {selectedFolder
                ? selectedFolder.relativePath
                : 'Select folder...'}
            </span>
          </div>
          <SearchIcon className="ml-2 h-3 w-3 shrink-0 opacity-50" />
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
