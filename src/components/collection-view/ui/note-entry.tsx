import { invoke } from '@tauri-apps/api/core'
import { FileTextIcon } from 'lucide-react'
import { type CSSProperties, type MouseEvent, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { WorkspaceEntry } from '@/store/workspace-store'

type NoteEntryProps = {
  entry: WorkspaceEntry
  isActive: boolean
  isSelected: boolean
  onClick: (event: MouseEvent<HTMLLIElement>) => void
  onContextMenu: (event: MouseEvent<HTMLLIElement>) => void
  getPreview: (path: string) => string | undefined
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
  getPreview,
  setPreview,
  style,
  'data-index': dataIndex,
}: NoteEntryProps) {
  const [previewText, setPreviewText] = useState<string>('')

  useEffect(() => {
    // Check cache first
    const cachedPreview = getPreview(entry.path)
    if (cachedPreview !== undefined) {
      setPreviewText(cachedPreview)
      return
    }

    // Fetch if not in cache
    const fetchPreview = async () => {
      try {
        const text = await invoke<string>('get_note_preview', {
          path: entry.path,
        })
        setPreview(entry.path, text)
        setPreviewText(text)
      } catch (error) {
        console.error('Failed to fetch note preview:', error)
        setPreviewText('')
      }
    }

    fetchPreview()
  }, [entry.path, getPreview, setPreview])

  // Remove extension from display name
  const lastDotIndex = entry.name.lastIndexOf('.')
  const displayName =
    lastDotIndex > 0 ? entry.name.slice(0, lastDotIndex) : entry.name

  return (
    <li
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        'px-2 py-1 text-sm text-foreground/80 rounded-sm flex flex-col gap-1',
        'hover:bg-muted',
        (isActive || isSelected) && 'bg-accent'
      )}
      style={style}
      data-index={dataIndex}
    >
      <div className="flex items-center gap-2">
        <FileTextIcon className="size-4 shrink-0" />
        <span className="truncate cursor-default">{displayName}</span>
      </div>
      {previewText && (
        <div className="text-xs text-muted-foreground line-clamp-2 pl-6">
          {previewText}
        </div>
      )}
    </li>
  )
}
