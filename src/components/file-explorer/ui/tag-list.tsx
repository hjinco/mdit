import { invoke } from '@tauri-apps/api/core'
import { Menu, MenuItem } from '@tauri-apps/api/menu'
import { HashIcon, PlusIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/shallow'
import { cn } from '@/lib/utils'
import { useTagStore } from '@/store/tag-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'

type IndexingMeta = {
  indexedDocCount: number
}

export function TagList() {
  const { currentCollectionPath, setCurrentCollectionPath, workspacePath } =
    useWorkspaceStore(
      useShallow((state) => ({
        currentCollectionPath: state.currentCollectionPath,
        setCurrentCollectionPath: state.setCurrentCollectionPath,
        workspacePath: state.workspacePath,
      }))
    )
  const tags = useTagStore((state) => state.tags)
  const addTag = useTagStore((state) => state.addTag)
  const removeTag = useTagStore((state) => state.removeTag)
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

  const handleAddButtonClick = useCallback(async () => {
    // Check if workspace is indexed before allowing tag addition
    if (workspacePath) {
      try {
        const meta = await invoke<IndexingMeta>('get_indexing_meta', {
          workspacePath,
        })

        if (meta.indexedDocCount === 0) {
          toast.warning('Workspace must be indexed before adding tags', {
            action: {
              label: 'Settings',
              onClick: () => {
                useUIStore.getState().openSettingsWithTab('indexing')
              },
            },
            position: 'bottom-left',
          })
          return
        }
      } catch (error) {
        console.error('Failed to check indexing status:', error)
        // If we can't check indexing status, block tag addition to be safe
        toast.warning('Could not verify indexing status', {
          action: {
            label: 'Settings',
            onClick: () => {
              useUIStore.getState().openSettingsWithTab('indexing')
            },
          },
        })
        return
      }
    }

    setIsAddingTag(true)
    setInputValue('')
  }, [workspacePath])

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

  const handleTagContextMenu = useCallback(
    async (tagName: string, event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      try {
        const menu = await Menu.new({
          items: [
            await MenuItem.new({
              id: `delete-tag-${tagName}`,
              text: 'Delete',
              action: async () => {
                const tagPath = `#${tagName}`
                // If the deleted tag is currently selected, clear the collection path
                if (currentCollectionPath === tagPath) {
                  setCurrentCollectionPath(null)
                }
                await removeTag(tagName)
              },
            }),
          ],
        })

        await menu.popup()
      } catch (error) {
        console.error('Failed to open tag context menu:', error)
      }
    },
    [currentCollectionPath, removeTag, setCurrentCollectionPath]
  )

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
                  onContextMenu={(e) => handleTagContextMenu(tagName, e)}
                  className={cn(
                    'w-full text-left flex items-center pr-2 py-0.5 text-accent-foreground/90 min-w-0 rounded-sm transition-opacity cursor-pointer outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]',
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
        <div className={cn(hasTags && 'mt-0.5')}>
          <div className="flex items-center pr-2 py-1">
            <HashIcon className="size-4 mx-1.5 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={handleInputBlur}
              placeholder="Tag"
              className="h-auto py-0 px-0 text-sm rounded-none border-0 bg-transparent outline-none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleAddButtonClick}
          className={cn(
            'w-full text-left flex items-center pr-2 py-0.5 text-accent-foreground/90 min-w-0 rounded-sm transition-opacity cursor-pointer outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]',
            'hover:bg-stone-100/60 dark:hover:bg-stone-900/60',
            hasTags && 'mt-0.5'
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
