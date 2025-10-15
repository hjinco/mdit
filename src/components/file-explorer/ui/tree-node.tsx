import { FileIcon, FolderIcon, FolderOpenIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { useTabStore } from '@/store/tab-store'
import type { WorkspaceEntry } from '@/store/workspace-store'

type TreeNodeProps = {
  entry: WorkspaceEntry
  depth: number
  expandedDirectories: Record<string, boolean>
  onDirectoryClick: (path: string) => void
  onDirectoryContextMenu: (entry: WorkspaceEntry) => void | Promise<void>
  onFileContextMenu: (entry: WorkspaceEntry) => void | Promise<void>
  renamingEntryPath: string | null
  onRenameSubmit: (entry: WorkspaceEntry, name: string) => void | Promise<void>
  onRenameCancel: () => void
}

export function TreeNode({
  entry,
  depth,
  expandedDirectories,
  onDirectoryClick,
  onDirectoryContextMenu,
  onFileContextMenu,
  renamingEntryPath,
  onRenameSubmit,
  onRenameCancel,
}: TreeNodeProps) {
  const isDirectory = entry.isDirectory
  const hasChildren = (entry.children?.length ?? 0) > 0

  const openNote = useTabStore((s) => s.openNote)
  const activeTabPath = useTabStore((s) => s.tab?.path)

  const isExpanded = Boolean(expandedDirectories[entry.path])
  const isActive = !isDirectory && activeTabPath === entry.path

  const extension = useMemo(() => {
    if (entry.isDirectory) {
      return ''
    }

    const lastDotIndex = entry.name.lastIndexOf('.')

    if (lastDotIndex <= 0) {
      return ''
    }

    return entry.name.slice(lastDotIndex)
  }, [entry.isDirectory, entry.name])

  const baseName = useMemo(() => {
    if (entry.isDirectory) {
      return entry.name
    }

    if (!extension) {
      return entry.name
    }

    return entry.name.slice(0, entry.name.length - extension.length)
  }, [entry.isDirectory, entry.name, extension])

  const handleClick = () => {
    if (isDirectory) {
      onDirectoryClick(entry.path)
    } else if (entry.name.endsWith('.md')) {
      openNote(entry.path)
    }
  }

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (isDirectory) {
        onDirectoryContextMenu(entry)
      } else {
        onFileContextMenu(entry)
      }
    },
    [entry, isDirectory, onDirectoryContextMenu, onFileContextMenu]
  )

  const isRenaming = renamingEntryPath === entry.path
  const [draftName, setDraftName] = useState(baseName)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const hasSubmittedRef = useRef(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (isRenaming) {
      setDraftName(baseName)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    } else {
      hasSubmittedRef.current = false
    }
  }, [baseName, isRenaming])

  const submitRename = useCallback(async () => {
    if (hasSubmittedRef.current) {
      return
    }

    const trimmedName = draftName.trim()

    if (!trimmedName) {
      hasSubmittedRef.current = true
      onRenameCancel()
      return
    }

    let finalName = trimmedName

    if (!entry.isDirectory && extension) {
      if (trimmedName.endsWith(extension)) {
        finalName = trimmedName
      } else {
        finalName = `${trimmedName}${extension}`
      }
    }

    hasSubmittedRef.current = true
    await onRenameSubmit(entry, finalName)
  }, [draftName, entry, extension, onRenameCancel, onRenameSubmit])

  const handleRenameKeyDown = useCallback(
    async (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        await submitRename()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        hasSubmittedRef.current = true
        onRenameCancel()
      }
    },
    [onRenameCancel, submitRename]
  )

  const handleRenameBlur = useCallback(async () => {
    await submitRename()
  }, [submitRename])

  // Scroll into view when this node becomes active
  useEffect(() => {
    if (isActive && buttonRef.current) {
      buttonRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }, [isActive])

  return (
    <li>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          'w-full text-left flex items-center gap-1.5 px-2 py-1 text-accent-foreground/70 min-w-0 rounded-sm',
          'hover:bg-neutral-200/80 dark:hover:bg-neutral-700/80',
          isActive &&
            'bg-neutral-200 dark:bg-neutral-700 text-accent-foreground'
        )}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        disabled={isRenaming}
      >
        {isDirectory ? (
          isExpanded ? (
            <FolderOpenIcon className="size-4 shrink-0" />
          ) : (
            <FolderIcon className="size-4 shrink-0" />
          )
        ) : (
          <FileIcon className="size-4 shrink-0" />
        )}
        <div className="relative flex-1 min-w-0 truncate">
          <span className={cn('text-sm', isRenaming && 'invisible')}>
            {entry.name}
          </span>
          {isRenaming && (
            <input
              ref={inputRef}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameBlur}
              className="absolute inset-0 h-full truncate text-sm bg-background border border-border rounded px-1 py-0.5 outline-none"
              spellCheck={false}
              autoComplete="off"
            />
          )}
        </div>
      </button>

      {isDirectory && hasChildren && isExpanded && (
        <ul>
          {entry.children!.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              expandedDirectories={expandedDirectories}
              onDirectoryClick={onDirectoryClick}
              onDirectoryContextMenu={onDirectoryContextMenu}
              onFileContextMenu={onFileContextMenu}
              renamingEntryPath={renamingEntryPath}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
