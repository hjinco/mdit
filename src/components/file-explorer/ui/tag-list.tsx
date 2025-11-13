import { HashIcon, PlusIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { cn } from '@/lib/utils'
import { useTagStore } from '@/store/tag-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Input } from '@/ui/input'

export function TagList() {
  const { currentCollectionPath, setCurrentCollectionPath } = useWorkspaceStore(
    useShallow((state) => ({
      currentCollectionPath: state.currentCollectionPath,
      setCurrentCollectionPath: state.setCurrentCollectionPath,
    }))
  )
  const tags = useTagStore((state) => state.tags)
  const addTag = useTagStore((state) => state.addTag)
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isAddingTag && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isAddingTag])

  const handleTagClick = useCallback(
    (tagName: string) => {
      const tagPath = `#${tagName}`
      setCurrentCollectionPath((prev) => (prev === tagPath ? null : tagPath))
    },
    [setCurrentCollectionPath]
  )

  const handleAddButtonClick = useCallback(() => {
    setIsAddingTag(true)
    setInputValue('')
  }, [])

  const handleInputSubmit = useCallback(async () => {
    const trimmedValue = inputValue.trim()
    if (trimmedValue) {
      await addTag(trimmedValue)
      setCurrentCollectionPath(`#${trimmedValue}`)
      setInputValue('')
      setIsAddingTag(false)
    } else {
      setIsAddingTag(false)
    }
  }, [inputValue, addTag, setCurrentCollectionPath])

  const handleInputCancel = useCallback(() => {
    setInputValue('')
    setIsAddingTag(false)
  }, [])

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleInputSubmit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleInputCancel()
      }
    },
    [handleInputSubmit, handleInputCancel]
  )

  const handleInputBlur = useCallback(() => {
    handleInputSubmit()
  }, [handleInputSubmit])

  const hasTags = tags.length > 0

  return (
    <div className="mb-2 pb-2">
      {hasTags && (
        <ul className="space-y-0.5">
          {tags.map((tagName) => {
            const tagPath = `#${tagName}`
            const isSelected = currentCollectionPath === tagPath

            return (
              <li key={tagName}>
                <button
                  type="button"
                  onClick={() => handleTagClick(tagName)}
                  className={cn(
                    'w-full text-left flex items-center pr-2 py-0.5 text-accent-foreground/90 font-normal min-w-0 rounded-sm transition-opacity cursor-pointer outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]',
                    isSelected
                      ? 'bg-stone-100 dark:bg-stone-900 text-accent-foreground'
                      : 'hover:bg-stone-100/60 dark:hover:bg-stone-900/60'
                  )}
                >
                  <HashIcon className="size-4 mx-1.5 shrink-0" />
                  <div className="relative flex-1 min-w-0 truncate">
                    <span className="text-sm">{tagName}</span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {isAddingTag ? (
        <div className="mt-0.5">
          <div className="flex items-center pr-2 py-0.5">
            <HashIcon className="size-4 mx-1.5 shrink-0" />
            <Input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={handleInputBlur}
              placeholder="Tag name"
              className="h-auto py-0 px-2 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleAddButtonClick}
          className={cn(
            'w-full text-left flex items-center pr-2 py-0.5 text-accent-foreground/90 font-normal min-w-0 rounded-sm transition-opacity cursor-pointer outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]',
            'hover:bg-stone-100/60 dark:hover:bg-stone-900/60',
            !hasTags && 'mt-0.5'
          )}
        >
          <PlusIcon className="size-4 mx-1.5 shrink-0" />
          <div className="relative flex-1 min-w-0 truncate">
            <span className="text-sm">Add Tag</span>
          </div>
        </button>
      )}
    </div>
  )
}
