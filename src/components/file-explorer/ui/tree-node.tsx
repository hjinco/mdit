import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  ChevronDown,
  ChevronRight,
  FileTextIcon,
  ImageIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import type { Tab } from '@/store/tab-store'
import type { WorkspaceEntry } from '@/store/workspace-store'
import { isImageFile } from '@/utils/file-icon'
import { getEntryButtonClassName } from '../utils/entry-classnames'
import { TreeNodeRenameInput } from './tree-node-rename-input'

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

  const isExpanded = Boolean(expandedDirectories[entry.path])
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

  const handleChevronClick = useCallback(
    (
      event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>
    ) => {
      event.stopPropagation()
      if (isBusy) {
        return
      }
      onDirectoryClick(entry.path)
    },
    [entry.path, isBusy, onDirectoryClick]
  )

  const handleChevronKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleChevronClick(event)
      }
    },
    [handleChevronClick]
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

  // Common button ref callback that combines setNodeRef and buttonRef
  const handleButtonRef = useCallback(
    (node: HTMLButtonElement | null) => {
      setNodeRef(node)
      buttonRef.current = node
    },
    [setNodeRef]
  )

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
          <div className="flex items-center">
            <button
              ref={handleButtonRef}
              type="button"
              onClick={handlePrimaryAction}
              onContextMenu={handleContextMenu}
              className={getEntryButtonClassName({
                isSelected,
                isDragging,
                isRenaming,
                isAiRenaming,
                widthClass: 'flex-1',
              })}
              style={{ paddingLeft: `${depth === 0 ? 0 : 4 + depth * 8}px` }}
              disabled={isBusy}
              {...attributes}
              {...listeners}
            >
              <div
                role="button"
                tabIndex={isBusy ? -1 : 0}
                onClick={handleChevronClick}
                onKeyDown={handleChevronKeyDown}
                className={cn(
                  'shrink-0 px-1.5 py-1 outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
                  'text-foreground/70 hover:text-foreground',
                  'cursor-pointer',
                  isBusy && 'cursor-not-allowed opacity-50'
                )}
                aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
                aria-disabled={isBusy}
              >
                {isExpanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </div>
              <div className="relative flex-1 min-w-0 truncate flex items-center">
                <span className={cn('text-sm', isRenaming && 'opacity-0')}>
                  {entry.name}
                </span>
                {isRenaming && (
                  <TreeNodeRenameInput
                    draftName={draftName}
                    setDraftName={setDraftName}
                    inputRef={inputRef}
                    handleRenameKeyDown={handleRenameKeyDown}
                    handleRenameBlur={handleRenameBlur}
                  />
                )}
              </div>
            </button>
          </div>
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
          ref={handleButtonRef}
          type="button"
          onClick={handlePrimaryAction}
          onContextMenu={handleContextMenu}
          className={getEntryButtonClassName({
            isSelected,
            isDragging,
            isRenaming,
            isAiRenaming,
            widthClass: 'w-full',
          })}
          style={{ paddingLeft: `${depth === 0 ? 0 : 4 + depth * 8}px` }}
          disabled={isBusy}
          {...attributes}
          {...listeners}
        >
          {isImage ? (
            <ImageIcon className="size-4 mx-1.5 shrink-0" />
          ) : (
            <FileTextIcon className="size-4 mx-1.5 shrink-0" />
          )}
          <div className="relative flex-1 min-w-0 truncate">
            <span className={cn('text-sm', isRenaming && 'opacity-0')}>
              {baseName}
            </span>
            {isRenaming && (
              <TreeNodeRenameInput
                draftName={draftName}
                setDraftName={setDraftName}
                inputRef={inputRef}
                handleRenameKeyDown={handleRenameKeyDown}
                handleRenameBlur={handleRenameBlur}
                className="pt-[1px]"
              />
            )}
          </div>
        </button>
      )}
    </li>
  )
}
