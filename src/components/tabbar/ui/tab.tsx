import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type TabProps = {
  name: string
  onRename: (newName: string) => void
}

export function Tab({ name, onRename }: TabProps) {
  const [isEditing, setIsEditing] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleClick = useCallback(() => {
    setIsEditing(true)
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.focus()
        // Select all text
        const range = document.createRange()
        range.selectNodeContents(contentRef.current)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }, 0)
  }, [])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    if (contentRef.current) {
      const newName = contentRef.current.textContent?.trim() || 'Untitled'
      onRename(newName)
    }
  }, [onRename])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        contentRef.current?.blur()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (contentRef.current) {
          contentRef.current.textContent = name
        }
        contentRef.current?.blur()
      }
    },
    [name]
  )

  return (
    <div
      ref={contentRef}
      className={cn(
        'py-2 cursor-text',
        isEditing ? 'text-foreground outline-none' : 'text-muted-foreground'
      )}
      contentEditable={isEditing}
      suppressContentEditableWarning={true}
      onClick={handleClick}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      role="textbox"
      tabIndex={0}
    >
      {name}
    </div>
  )
}
