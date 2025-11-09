import { invoke } from '@tauri-apps/api/core'
import {
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { cn } from '@/lib/utils'
import type { WorkspaceEntry } from '@/store/workspace-store'

type NoteEntryProps = {
  entry: WorkspaceEntry
  isActive: boolean
  isSelected: boolean
  onClick: (event: MouseEvent<HTMLLIElement>) => void
  onContextMenu: (event: MouseEvent<HTMLLIElement>) => void
  previewText?: string
  setPreview: (path: string, preview: string) => void
  isRenaming?: boolean
  onRenameSubmit: (entry: WorkspaceEntry, newName: string) => Promise<void>
  onRenameCancel: () => void
  style?: CSSProperties
  'data-index'?: number
}

export function NoteEntry({
  entry,
  isActive,
  isSelected,
  onClick,
  onContextMenu,
  previewText,
  setPreview,
  isRenaming = false,
  onRenameSubmit,
  onRenameCancel,
  style,
  'data-index': dataIndex,
}: NoteEntryProps) {
  useEffect(() => {
    // If preview is already available, no need to fetch
    if (previewText !== undefined) {
      return
    }

    // Fetch if not in cache
    const fetchPreview = async () => {
      try {
        const text = await invoke<string>('get_note_preview', {
          path: entry.path,
        })
        setPreview(entry.path, text)
      } catch (error) {
        console.error('Failed to fetch note preview:', error)
        setPreview(entry.path, '')
      }
    }

    fetchPreview()
  }, [entry.path, previewText, setPreview])

  // Remove extension from display name
  const lastDotIndex = entry.name.lastIndexOf('.')
  const baseName =
    lastDotIndex > 0 ? entry.name.slice(0, lastDotIndex) : entry.name
  const extension = lastDotIndex > 0 ? entry.name.slice(lastDotIndex) : ''

  const [draftName, setDraftName] = useState(baseName)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const hasSubmittedRef = useRef(false)

  useEffect(() => {
    if (isRenaming) {
      setDraftName(baseName)
      hasSubmittedRef.current = false
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

    if (extension) {
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

  return (
    <li
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        'px-3 py-2 text-foreground/80 rounded-sm flex flex-col gap-1 mb-1',
        isActive || isSelected
          ? 'bg-stone-100 dark:bg-stone-900'
          : 'hover:bg-stone-100/60 dark:hover:bg-stone-900/60'
      )}
      style={style}
      data-index={dataIndex}
    >
      <div className="flex relative">
        <span className="text-base font-medium truncate cursor-default">
          {baseName}
        </span>
        {isRenaming && (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={handleRenameBlur}
            className="absolute inset-0 h-full truncate text-base font-medium outline-none bg-stone-100 dark:bg-stone-900"
            spellCheck={false}
            autoComplete="off"
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
      <div className="text-xs font-medium text-muted-foreground line-clamp-2 cursor-default min-h-8">
        {previewText ?? '\u00A0'}
      </div>
    </li>
  )
}
