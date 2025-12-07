import { readTextFile, rename as renameFile } from '@tauri-apps/plugin-fs'
import { create } from 'zustand'
import { getFileNameWithoutExtension } from '@/utils/path-utils'
import { LAST_OPENED_NOTE_KEY } from './constants'

let tabIdCounter = 0

const MAX_HISTORY_LENGTH = 50

export type Tab = {
  id: number
  path: string
  name: string
  content: string
}

type RenameTabOptions = {
  refreshContent?: boolean
  renameOnFs?: boolean
}

type LinkedTab = {
  path: string
  name: string
} | null

type TabStore = {
  tab: Tab | null
  linkedTab: LinkedTab
  isSaved: boolean
  history: string[]
  historyIndex: number
  hydrateFromOpenedFiles: (paths: string[]) => Promise<boolean>
  openTab: (
    path: string,
    skipHistory?: boolean,
    force?: boolean
  ) => Promise<void>
  openNote: (path: string) => Promise<void>
  closeTab: (path: string) => void
  renameTab: (
    oldPath: string,
    newPath: string,
    options?: RenameTabOptions
  ) => Promise<void>
  setTabSaved: (isSaved: boolean) => void
  setLinkedTab: (linkedTab: LinkedTab) => void
  updateLinkedName: (name: string) => void
  clearLinkedTab: () => void
  goBack: () => Promise<boolean>
  goForward: () => Promise<boolean>
  canGoBack: () => boolean
  canGoForward: () => boolean
  updateHistoryPath: (oldPath: string, newPath: string) => void
  removePathFromHistory: (path: string) => void
  clearHistory: () => void
}

export const useTabStore = create<TabStore>((set, get) => ({
  tab: null,
  linkedTab: null,
  isSaved: true,
  history: [],
  historyIndex: -1,
  hydrateFromOpenedFiles: async (paths: string[]) => {
    const validPaths = paths.filter((path) => path.endsWith('.md'))

    if (validPaths.length === 0) {
      return false
    }

    const initialPath = validPaths[0]
    const name = getFileNameWithoutExtension(initialPath)

    if (!name) {
      return false
    }

    try {
      const content = await readTextFile(initialPath)
      const limitedHistory = validPaths.slice(0, MAX_HISTORY_LENGTH)
      const initialIndex = Math.max(0, limitedHistory.indexOf(initialPath))

      set({
        tab: { id: ++tabIdCounter, path: initialPath, name, content },
        linkedTab: null,
        isSaved: true,
        history: limitedHistory,
        historyIndex: initialIndex,
      })

      return true
    } catch (error) {
      console.error('Failed to hydrate tabs from opened files:', error)
      return false
    }
  },
  openTab: async (path: string, skipHistory = false, force = false) => {
    if (!path.endsWith('.md')) {
      return
    }

    const state = get()

    // If opening the same tab, don't do anything (unless force is true)
    if (!force && state.tab?.path === path) {
      return
    }

    const content = await readTextFile(path)
    const name = getFileNameWithoutExtension(path)

    if (name) {
      set({
        tab: { id: ++tabIdCounter, path, name, content },
        linkedTab: null,
        isSaved: true,
      })

      // Manage history unless we're navigating (skipHistory = true)
      if (!skipHistory) {
        const currentState = get()
        let newHistory = [...currentState.history]
        let newIndex = currentState.historyIndex

        // Check if the path is different from the current history position
        const isDifferentFromCurrent =
          newIndex === -1 || newHistory[newIndex] !== path

        if (isDifferentFromCurrent) {
          // Truncate forward history
          newHistory = newHistory.slice(0, newIndex + 1)

          // Add new path
          newHistory.push(path)
          newIndex = newHistory.length - 1

          // Enforce max history length
          if (newHistory.length > MAX_HISTORY_LENGTH) {
            const excess = newHistory.length - MAX_HISTORY_LENGTH
            newHistory = newHistory.slice(excess)
            newIndex -= excess
          }

          set({
            history: newHistory,
            historyIndex: newIndex,
          })
        }

        // Save last opened note path to localStorage
        try {
          localStorage.setItem(LAST_OPENED_NOTE_KEY, path)
        } catch (error) {
          console.debug('Failed to save last opened note:', error)
        }
      }
    }
  },
  openNote: async (path: string) => {
    await get().openTab(path)
  },
  closeTab: (path) => {
    const tab = get().tab

    if (!tab || tab.path !== path) {
      return
    }

    set({ tab: null })
  },
  renameTab: async (oldPath, newPath, options) => {
    const refreshContent = options?.refreshContent ?? false
    const shouldRenameOnFs = options?.renameOnFs ?? false
    const tab = get().tab

    if (!tab || tab.path !== oldPath) {
      return
    }

    if (shouldRenameOnFs && oldPath !== newPath) {
      try {
        await renameFile(oldPath, newPath)
        const nextName = getFileNameWithoutExtension(newPath)
        const { linkedTab } = get()
        const tab = get().tab
        if (!tab) {
          return
        }
        const nextTab = {
          ...tab,
          path: newPath,
          name: nextName,
        }
        const shouldCarryLinked = linkedTab && linkedTab.path === oldPath

        set({
          tab: nextTab,
          linkedTab: shouldCarryLinked
            ? {
                ...linkedTab,
                path: newPath,
              }
            : linkedTab,
        })
        return
      } catch (error) {
        console.error('Failed to rename tab on filesystem:', error)
        throw error
      }
    }

    const name = getFileNameWithoutExtension(newPath)

    if (!name) {
      set({ tab: null, linkedTab: null })
      return
    }

    let content = tab.content
    let nextId = tab.id

    if (refreshContent) {
      nextId = ++tabIdCounter

      if (newPath.endsWith('.md')) {
        try {
          content = await readTextFile(newPath)
        } catch (error) {
          console.error('Failed to refresh tab content after rename:', error)
        }
      }
    }

    const { linkedTab } = get()
    const shouldCarryLinked = linkedTab && linkedTab.path === oldPath
    const nextTab = {
      ...tab,
      id: nextId,
      path: newPath,
      name,
      content,
    }

    set((state) => ({
      ...state,
      tab: nextTab,
      linkedTab: shouldCarryLinked
        ? {
            ...linkedTab,
            path: newPath,
          }
        : state.linkedTab,
    }))
  },
  setTabSaved: (isSaved) => {
    set({
      isSaved,
    })
  },
  setLinkedTab: (linkedTab) => {
    set({ linkedTab })
  },
  updateLinkedName: (name) => {
    const { tab, linkedTab } = get()

    if (!tab || !linkedTab) {
      return
    }

    const isSameTab = linkedTab.path === tab.path

    if (!isSameTab || linkedTab.name === name) {
      return
    }

    set({ linkedTab: { ...linkedTab, name } })
  },
  clearLinkedTab: () => {
    set({ linkedTab: null })
  },
  goBack: async () => {
    const state = get()

    // Check if we can go back
    if (state.historyIndex <= 0) {
      return false
    }

    const newIndex = state.historyIndex - 1
    const targetPath = state.history[newIndex]

    // Update index first
    set({ historyIndex: newIndex })

    // Open the tab (with skipHistory to avoid adding to history)
    try {
      await get().openTab(targetPath, true)
      return true
    } catch (error) {
      console.error('Failed to go back in history:', error)
      return false
    }
  },
  goForward: async () => {
    const state = get()

    // Check if we can go forward
    if (state.historyIndex >= state.history.length - 1) {
      return false
    }

    const newIndex = state.historyIndex + 1
    const targetPath = state.history[newIndex]

    // Update index first
    set({ historyIndex: newIndex })

    // Open the tab (with skipHistory to avoid adding to history)
    try {
      await get().openTab(targetPath, true)
      return true
    } catch (error) {
      console.error('Failed to go forward in history:', error)
      return false
    }
  },
  canGoBack: () => {
    const state = get()
    return state.historyIndex > 0
  },
  canGoForward: () => {
    const state = get()
    return state.historyIndex < state.history.length - 1
  },
  updateHistoryPath: (oldPath: string, newPath: string) => {
    const state = get()

    // Update all occurrences of oldPath in history
    const updatedHistory = state.history.map((path) =>
      path === oldPath ? newPath : path
    )

    set({ history: updatedHistory })
  },
  removePathFromHistory: (path: string) => {
    const state = get()

    // Check if current tab is being deleted
    const isCurrentTabDeleted = state.tab?.path === path

    // Filter out the deleted path
    const filteredHistory = state.history.filter((p) => p !== path)

    // Adjust historyIndex
    let newIndex = state.historyIndex

    // Count how many instances before current index were removed
    const removedBeforeIndex = state.history
      .slice(0, state.historyIndex + 1)
      .filter((p) => p === path).length

    newIndex -= removedBeforeIndex

    // Ensure index is within bounds
    if (newIndex >= filteredHistory.length) {
      newIndex = filteredHistory.length - 1
    }

    // If current tab was deleted, try to go back to previous valid tab
    if (isCurrentTabDeleted && filteredHistory.length > 0 && newIndex >= 0) {
      set({
        history: filteredHistory,
        historyIndex: newIndex,
      })

      // Automatically go back to the previous valid tab
      const targetPath = filteredHistory[newIndex]
      get()
        .openTab(targetPath, true)
        .catch((error) => {
          console.error('Failed to navigate after deletion:', error)
          set({ tab: null })
        })
    } else if (isCurrentTabDeleted) {
      // No valid history remains
      set({
        tab: null,
        history: filteredHistory,
        historyIndex: -1,
      })
    } else {
      // Just update history without changing tab
      set({
        history: filteredHistory,
        historyIndex: newIndex,
      })
    }
  },
  clearHistory: () => {
    set({
      history: [],
      historyIndex: -1,
    })
  },
}))
