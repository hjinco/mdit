import { invoke } from '@tauri-apps/api/core'
import { type CSSProperties, type MouseEvent, useEffect } from 'react'
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
  const displayName =
    lastDotIndex > 0 ? entry.name.slice(0, lastDotIndex) : entry.name

  return (
    <li
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        'px-3 py-2 text-foreground/80 rounded-sm flex flex-col gap-1 mb-1',
        'hover:bg-muted',
        (isActive || isSelected) && 'bg-accent'
      )}
      style={style}
      data-index={dataIndex}
    >
      <div className="flex">
        <span className="text-base font-medium truncate cursor-default">
          {displayName}
        </span>
      </div>
      <div className="text-xs font-medium text-muted-foreground line-clamp-2 cursor-default min-h-8">
        {previewText ?? '&nbsp;'}
      </div>
    </li>
  )
}
