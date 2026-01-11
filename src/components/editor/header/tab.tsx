import { SquarePenIcon } from 'lucide-react'
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/shallow'

import { cn } from '@/lib/utils'
import { useTabStore } from '@/store/tab-store'
import { useWorkspaceFsStore } from '@/store/workspace-fs-store'
import type { WorkspaceEntry } from '@/store/workspace-store'
import {
  getFileNameFromPath,
  getFileNameWithoutExtension,
} from '@/utils/path-utils'

export function Tab() {
  const { tab, linkedTab, clearLinkedTab } = useTabStore(
    useShallow((s) => ({
      tab: s.tab,
      linkedTab: s.linkedTab,
      clearLinkedTab: s.clearLinkedTab,
    }))
  )
  const renameEntry = useWorkspaceFsStore((state) => state.renameEntry)
  const [isEditing, setIsEditing] = useState(false)
  const displayName = linkedTab?.name ?? tab?.name ?? ''
  const [draftName, setDraftName] = useState(displayName)
  const [isRenaming, setIsRenaming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const entry = useMemo<WorkspaceEntry | null>(() => {
    if (!tab) return null
    const name = getFileNameFromPath(tab.path)
    if (!name) return null
    return {
      path: tab.path,
      name,
      isDirectory: false,
    }
  }, [tab])

  useEffect(() => {
    if (!isEditing && displayName) {
      setDraftName(displayName)
    }
  }, [displayName, isEditing])

  useEffect(() => {
    if (!tab?.path) {
      return
    }

    // Cancel edits when the active tab changes to avoid renaming the wrong file.
    setIsEditing(false)
    setDraftName(linkedTab?.name ?? getFileNameWithoutExtension(tab.path))
  }, [linkedTab?.name, tab?.path])

  useEffect(() => {
    if (!isEditing) return
    const element = inputRef.current
    if (!element) return
    element.focus()
    element.select()
  }, [isEditing])

  const handleStartEditing = useCallback(() => {
    if (!tab) return
    setDraftName(displayName)
    setIsEditing(true)
  }, [displayName, tab])

  const handleCancelEditing = useCallback(() => {
    if (tab) {
      setDraftName(displayName)
    }
    setIsEditing(false)
  }, [displayName, tab])

  const handleRename = useCallback(async () => {
    if (isRenaming) {
      return
    }

    if (!tab || !entry) {
      setIsEditing(false)
      return
    }

    const trimmed = draftName.trim()

    if (!trimmed) {
      handleCancelEditing()
      return
    }

    const extension = getExtension(entry.name)
    const nextFileName = extension ? `${trimmed}${extension}` : trimmed

    if (nextFileName === entry.name) {
      setIsEditing(false)
      return
    }

    try {
      setIsRenaming(true)
      const renamedPath = await renameEntry(entry, nextFileName)
      if (!renamedPath) {
        throw new Error('Rename rejected')
      }
      clearLinkedTab()
    } catch (error) {
      console.error('Failed to rename tab entry:', error)
      toast.error('Failed to rename tab.')
      handleCancelEditing()
      return
    } finally {
      setIsRenaming(false)
    }

    setIsEditing(false)
  }, [
    clearLinkedTab,
    draftName,
    entry,
    handleCancelEditing,
    isRenaming,
    renameEntry,
    tab,
  ])

  const handleBlur = useCallback(() => {
    if (!isEditing || isRenaming) return
    handleRename().catch(console.error)
  }, [handleRename, isEditing, isRenaming])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        handleRename().catch(console.error)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        handleCancelEditing()
      }
    },
    [handleCancelEditing, handleRename]
  )

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDraftName(event.currentTarget.value)
  }, [])

  if (!tab) return null

  return (
    <div className="group relative flex cursor-default items-center py-2 px-2 text-sm text-muted-foreground">
      <div className="relative w-full">
        <div
          aria-hidden={isEditing}
          className={cn('max-w-sm truncate', isEditing && 'hidden')}
        >
          {displayName}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={draftName}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            'bg-transparent text-foreground text-center outline-none transition-opacity caret-foreground',
            'focus-visible:outline-none focus-visible:ring-0',
            isEditing ? 'flex' : 'hidden'
          )}
        />
      </div>
      {!isEditing && (
        <button
          type="button"
          onClick={handleStartEditing}
          className={cn(
            'absolute -right-4 top-1/2 opacity-0 will-change-transform -translate-y-1/2 items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:opacity-100 group-hover:opacity-100 transition-opacity cursor-pointer'
          )}
        >
          <SquarePenIcon className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">edit</span>
        </button>
      )}
    </div>
  )
}

function getExtension(fileName: string) {
  const index = fileName.lastIndexOf('.')
  if (index <= 0) return ''
  return fileName.slice(index)
}
