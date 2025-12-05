import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  ChevronDown,
  ChevronRight,
  FileTextIcon,
  ImageIcon,
  PanelLeftIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import type { Tab } from '@/store/tab-store'
import type { WorkspaceEntry } from '@/store/workspace-store'
import { isImageFile } from '@/utils/file-icon'
import { useFolderDropZone } from '../hooks/use-folder-drop-zone'
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
  pendingNewFolderPath: string | null
  onNewFolderSubmit: (
    directoryPath: string,
    folderName: string
  ) => void | Promise<void>
  onNewFolderCancel: () => void
  onCollectionViewOpen: (entry: WorkspaceEntry) => void
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
  pendingNewFolderPath,
  onNewFolderSubmit,
  onNewFolderCancel,
  onCollectionViewOpen,
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

  // Setup droppable only for directories (for internal dnd)
  const { setNodeRef: setDroppableRef, isOver: isOverInternal } = useDroppable({
    id: `droppable-${entry.path}`,
    data: {
      path: entry.path,
      isDirectory: entry.isDirectory,
      depth,
    },
    disabled: !entry.isDirectory || isBusy,
  })

  // Setup external file drop zone for directories
  const { isOver: isOverExternal, ref: externalDropRef } = useFolderDropZone({
    folderPath: entry.isDirectory ? entry.path : null,
    depth,
  })

  // Combine both drop states for visual feedback
  const isOver = isOverInternal || isOverExternal

  const handlePrimaryAction = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isBusy) {
        return
      }
      onEntryPrimaryAction(entry, event)
    },
    [entry, isBusy, onEntryPrimaryAction]
  )

  const handleCollectionViewClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (isBusy) {
        return
      }
      onCollectionViewOpen(entry)
    },
    [entry, isBusy, onCollectionViewOpen]
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
  const [newFolderName, setNewFolderName] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const newFolderInputRef = useRef<HTMLInputElement | null>(null)
  const hasSubmittedRef = useRef(false)
  const hasSubmittedNewFolderRef = useRef(false)
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

  // New folder input handlers
  const hasPendingNewFolder = pendingNewFolderPath === entry.path

  useEffect(() => {
    if (hasPendingNewFolder) {
      setNewFolderName('')
      requestAnimationFrame(() => {
        newFolderInputRef.current?.focus()
        newFolderInputRef.current?.select()
      })
    } else {
      hasSubmittedNewFolderRef.current = false
    }
  }, [hasPendingNewFolder])

  const submitNewFolder = useCallback(async () => {
    if (hasSubmittedNewFolderRef.current) {
      return
    }

    const trimmedName = newFolderName.trim()

    if (!trimmedName) {
      hasSubmittedNewFolderRef.current = true
      onNewFolderCancel()
      return
    }

    hasSubmittedNewFolderRef.current = true
    await onNewFolderSubmit(entry.path, trimmedName)
  }, [newFolderName, entry.path, onNewFolderCancel, onNewFolderSubmit])

  const handleNewFolderKeyDown = useCallback(
    async (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        await submitNewFolder()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        hasSubmittedNewFolderRef.current = true
        onNewFolderCancel()
      }
    },
    [onNewFolderCancel, submitNewFolder]
  )

  const handleNewFolderBlur = useCallback(async () => {
    await submitNewFolder()
  }, [submitNewFolder])

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
          ref={(node) => {
            setDroppableRef(node)
            externalDropRef(node)
          }}
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
              id={entry.path}
              onClick={handlePrimaryAction}
              onContextMenu={handleContextMenu}
              className={cn(
                getEntryButtonClassName({
                  isSelected,
                  isDragging,
                  isRenaming,
                  isAiRenaming,
                  widthClass: 'flex-1',
                }),
                'group relative'
              )}
              style={{ paddingLeft: `${depth === 0 ? 0 : 4 + depth * 8}px` }}
              disabled={isBusy}
              {...attributes}
              {...listeners}
            >
              <div
                className={cn(
                  'shrink-0 px-1.5 py-1',
                  'text-foreground/70',
                  'pointer-events-none'
                )}
                aria-hidden="true"
              >
                {isExpanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </div>
              <div className="relative flex-1 min-w-0 flex items-center">
                <span
                  className={cn('text-sm truncate', isRenaming && 'opacity-0')}
                >
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
              <button
                type="button"
                onClick={handleCollectionViewClick}
                className={cn(
                  'absolute right-1 shrink-0 px-0.5 py-0.5 outline-none',
                  'bg-muted text-foreground/70 hover:text-foreground rounded-sm',
                  'opacity-0 group-hover:opacity-100 transition-opacity duration-250',
                  'cursor-pointer',
                  isBusy && 'cursor-not-allowed opacity-50'
                )}
                aria-label="Open collection view"
                disabled={isBusy}
              >
                <PanelLeftIcon className="size-4" />
              </button>
            </button>
          </div>
          {hasPendingNewFolder && (
            <div
              className="flex-1 flex items-center px-2 py-0.5 mt-0.5 ring-1 ring-ring/50 rounded-sm"
              style={{
                paddingLeft: `${4 + (depth + 1) * 8}px`,
              }}
            >
              <div className="shrink-0 px-1.5 py-1" aria-hidden="true">
                <ChevronRight className="size-4" />
              </div>
              <div className="relative flex-1 min-w-0 flex items-center">
                <span className="text-sm opacity-0">Placeholder</span>
                <TreeNodeRenameInput
                  draftName={newFolderName}
                  setDraftName={setNewFolderName}
                  inputRef={newFolderInputRef}
                  handleRenameKeyDown={handleNewFolderKeyDown}
                  handleRenameBlur={handleNewFolderBlur}
                />
              </div>
            </div>
          )}
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
                  pendingNewFolderPath={pendingNewFolderPath}
                  onNewFolderSubmit={onNewFolderSubmit}
                  onNewFolderCancel={onNewFolderCancel}
                  onCollectionViewOpen={onCollectionViewOpen}
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button
          ref={handleButtonRef}
          type="button"
          id={entry.path}
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
