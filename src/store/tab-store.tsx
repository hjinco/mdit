import { readTextFile } from '@tauri-apps/plugin-fs'
import { create } from 'zustand'

let tabIdCounter = 0

const MAX_HISTORY_LENGTH = 50

export type Tab = {
  id: number
  path: string
  name: string
  content: string
}

type TabStore = {
  tab: Tab | null
  isSaved: boolean
  history: string[]
  historyIndex: number
  openTab: (path: string, skipHistory?: boolean) => Promise<void>
  openNote: (path: string) => Promise<void>
  closeTab: (path: string) => void
  renameTab: (oldPath: string, newPath: string) => void
  setTabSaved: (isSaved: boolean) => void
  goBack: () => Promise<boolean>
  goForward: () => Promise<boolean>
  canGoBack: () => boolean
  canGoForward: () => boolean
  updateHistoryPath: (oldPath: string, newPath: string) => void
  removePathFromHistory: (path: string) => void
}

export const useTabStore = create<TabStore>((set, get) => ({
  tab: null,
  isSaved: true,
  history: [],
  historyIndex: -1,
  openTab: async (path: string, skipHistory = false) => {
    if (!path.endsWith('.md')) {
      return
    }

    const state = get()

    // If opening the same tab, don't do anything
    if (state.tab?.path === path) {
      return
    }

    const content = await readTextFile(path)
    const name = path.split('/').pop()?.split('.').shift()

    if (name) {
      set({
        tab: { id: ++tabIdCounter, path, name, content },
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
  renameTab: (oldPath, newPath) => {
    const tab = get().tab

    if (!tab || tab.path !== oldPath) {
      return
    }

    const name = newPath.split('/').pop()?.split('.').shift()

    if (!name) {
      set({ tab: null })
      return
    }

    set({
      tab: {
        ...tab,
        path: newPath,
        name,
      },
    })
  },
  setTabSaved: (isSaved) => {
    set({
      isSaved,
    })
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
}))
