import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  EyeIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  ImageIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import type { Tab } from '@/store/tab-store'
import type { WorkspaceEntry } from '@/store/workspace-store'
import { isImageFile } from '../utils/file-icon'

type TreeNodeProps = {
  entry: WorkspaceEntry
  tab: Tab | null
  depth: number
  expandedDirectories: Record<string, boolean>
  onDirectoryClick: (path: string) => void
  onEntryPrimaryAction: (
    entry: WorkspaceEntry,
    event: React.MouseEvent<HTMLButtonElement>
  ) => void
  onEntryContextMenu: (entry: WorkspaceEntry) => void | Promise<void>
  selectedEntryPaths: Set<string>
  renamingEntryPath: string | null
  aiRenamingEntryPaths: Set<string>
  onRenameSubmit: (entry: WorkspaceEntry, name: string) => void | Promise<void>
  onRenameCancel: () => void
}

export function TreeNode({
  entry,
  tab,
  depth,
  expandedDirectories,
  onDirectoryClick,
  onEntryPrimaryAction,
  onEntryContextMenu,
  selectedEntryPaths,
  renamingEntryPath,
  aiRenamingEntryPaths,
  onRenameSubmit,
  onRenameCancel,
}: TreeNodeProps) {
  const isDirectory = entry.isDirectory
  const hasChildren = (entry.children?.length ?? 0) > 0
  const isRenaming = renamingEntryPath === entry.path
  const isAiRenaming = aiRenamingEntryPaths.has(entry.path)
  const isBusy = isRenaming || isAiRenaming
  const activeTabPath = tab?.path

  const isExpanded = Boolean(expandedDirectories[entry.path])
  const isActive = !isDirectory && activeTabPath === entry.path
  const isSelected = selectedEntryPaths.has(entry.path)

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

  const isImage = useMemo(() => isImageFile(extension), [extension])

  // Setup draggable
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.path,
    data: {
      path: entry.path,
      isDirectory: entry.isDirectory,
      name: entry.name,
    },
    disabled: isBusy,
  })

  // Setup droppable only for directories
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable-${entry.path}`,
    data: {
      path: entry.path,
      isDirectory: entry.isDirectory,
      depth,
    },
    disabled: !entry.isDirectory || isBusy,
  })

  const handlePrimaryAction = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isBusy) {
        return
      }
      onEntryPrimaryAction(entry, event)
    },
    [entry, isBusy, onEntryPrimaryAction]
  )

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (isBusy) {
        return
      }

      onEntryContextMenu(entry)
    },
    [entry, isBusy, onEntryContextMenu]
  )

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

  // Auto-expand folder when dragging over it
  const autoExpandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )

  useEffect(() => {
    if (isOver && isDirectory && !isExpanded && hasChildren) {
      if (autoExpandTimeoutRef.current) {
        clearTimeout(autoExpandTimeoutRef.current)
      }
      autoExpandTimeoutRef.current = setTimeout(() => {
        onDirectoryClick(entry.path)
      }, 500)
    } else if (autoExpandTimeoutRef.current) {
      clearTimeout(autoExpandTimeoutRef.current)
      autoExpandTimeoutRef.current = null
    }

    return () => {
      if (autoExpandTimeoutRef.current) {
        clearTimeout(autoExpandTimeoutRef.current)
      }
    }
  }, [
    isOver,
    isDirectory,
    isExpanded,
    hasChildren,
    entry.path,
    onDirectoryClick,
  ])

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
      {isDirectory ? (
        <div
          ref={setDroppableRef}
          className={cn(
            'rounded-sm transition-colors',
            isOver &&
              'bg-blue-100/30 dark:bg-blue-900/30 ring-2 ring-inset ring-blue-400 dark:ring-blue-600'
          )}
        >
          <button
            ref={(node) => {
              setNodeRef(node)
              buttonRef.current = node
            }}
            type="button"
            onClick={handlePrimaryAction}
            onContextMenu={handleContextMenu}
            className={cn(
              'w-full text-left flex items-center gap-1.5 px-2 py-0.5 text-accent-foreground/90 font-normal min-w-0 rounded-sm transition-opacity cursor-pointer outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]',
              isSelected
                ? 'bg-stone-100 dark:bg-stone-900 text-accent-foreground'
                : 'hover:bg-stone-100/60 dark:hover:bg-stone-900/60',
              isDragging && 'opacity-50 cursor-grabbing',
              isRenaming && 'ring-1 ring-ring/50',
              isAiRenaming && 'animate-pulse'
            )}
            style={{ paddingLeft: `${10 + depth * 10}px` }}
            disabled={isBusy}
            {...attributes}
            {...listeners}
          >
            {isExpanded ? (
              <FolderOpenIcon className="size-4 shrink-0" />
            ) : (
              <FolderIcon className="size-4 shrink-0" />
            )}
            <div className="relative flex-1 min-w-0 truncate">
              <span className="text-sm">{entry.name}</span>
              {isRenaming && (
                <input
                  ref={inputRef}
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={handleRenameBlur}
                  className="absolute inset-0 h-full truncate text-sm px-0 pt-[1px] pb-0 outline-none bg-stone-100 dark:bg-stone-900"
                  spellCheck={false}
                  autoComplete="off"
                />
              )}
            </div>
          </button>

          {hasChildren && isExpanded && (
            <ul className="space-y-0.5 mt-0.5">
              {entry.children?.map((child) => (
                <TreeNode
                  key={child.path}
                  entry={child}
                  tab={tab}
                  depth={depth + 1}
                  expandedDirectories={expandedDirectories}
                  onDirectoryClick={onDirectoryClick}
                  onEntryPrimaryAction={onEntryPrimaryAction}
                  onEntryContextMenu={onEntryContextMenu}
                  selectedEntryPaths={selectedEntryPaths}
                  renamingEntryPath={renamingEntryPath}
                  aiRenamingEntryPaths={aiRenamingEntryPaths}
                  onRenameSubmit={onRenameSubmit}
                  onRenameCancel={onRenameCancel}
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button
          ref={(node) => {
            setNodeRef(node)
            buttonRef.current = node
          }}
          type="button"
          onClick={handlePrimaryAction}
          onContextMenu={handleContextMenu}
          className={cn(
            'w-full text-left flex items-center gap-1.5 px-2.5 py-0.5 text-accent-foreground/90 font-normal min-w-0 rounded-sm transition-opacity cursor-pointer outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]',
            isSelected
              ? 'bg-stone-100 dark:bg-stone-900 text-accent-foreground'
              : 'hover:bg-stone-100/60 dark:hover:bg-stone-900/60',
            isDragging && 'opacity-50 cursor-grabbing',
            isRenaming && 'ring-1 ring-ring/50',
            isAiRenaming && 'animate-pulse'
          )}
          style={{ paddingLeft: `${10 + depth * 10}px` }}
          disabled={isBusy}
          {...attributes}
          {...listeners}
        >
          {isImage ? (
            <ImageIcon className="size-4 shrink-0" />
          ) : (
            <FileIcon className="size-4 shrink-0" />
          )}
          <div className="relative flex-1 min-w-0 truncate">
            <span className="text-sm">{baseName}</span>
            {isRenaming && (
              <input
                ref={inputRef}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleRenameBlur}
                className="absolute inset-0 h-full truncate text-sm px-0 pt-[1px] pb-0 outline-none bg-stone-100 dark:bg-stone-900"
                spellCheck={false}
                autoComplete="off"
              />
            )}
          </div>
          {isActive && (
            <EyeIcon className="size-3 shrink-0 text-muted-foreground" />
          )}
        </button>
      )}
    </li>
  )
}
