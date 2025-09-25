import { invoke } from '@tauri-apps/api/core'
import { dirname, join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import {
  exists,
  mkdir,
  readDir,
  rename,
  writeTextFile,
} from '@tauri-apps/plugin-fs'
import { create } from 'zustand'

import { useTabStore } from './tab-store'

const MAX_HISTORY_LENGTH = 5

export type WorkspaceEntry = {
  path: string
  name: string
  isDirectory: boolean
  children?: WorkspaceEntry[]
}

type WorkspaceStore = {
  isLoading: boolean
  workspacePath: string | null
  recentWorkspacePaths: string[]
  isTreeLoading: boolean
  entries: WorkspaceEntry[]
  expandedDirectories: Record<string, boolean>
  initializeWorkspace: () => void
  setWorkspace: (path: string) => void
  openFolderPicker: () => Promise<void>
  refreshWorkspaceEntries: () => Promise<void>
  toggleDirectory: (path: string) => void
  createFolder: (directoryPath: string) => Promise<string | null>
  createNote: (directoryPath: string) => Promise<string | null>
  deleteEntry: (path: string) => Promise<boolean>
  renameEntry: (
    entry: WorkspaceEntry,
    newName: string
  ) => Promise<string | null>
}

const WORKSPACE_HISTORY_KEY = 'workspace-history'

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  isLoading: true,
  workspacePath: null,
  recentWorkspacePaths: [],
  isTreeLoading: false,
  entries: [],
  expandedDirectories: {},

  initializeWorkspace: () => {
    try {
      let recentWorkspacePaths: string[] = []

      const rawHistory = localStorage.getItem(WORKSPACE_HISTORY_KEY)
      if (rawHistory) {
        try {
          recentWorkspacePaths = JSON.parse(rawHistory).filter(
            (entry: unknown): entry is string =>
              typeof entry === 'string' && entry.length > 0
          )
        } catch (error) {
          console.warn('Failed to parse workspace history:', error)
          recentWorkspacePaths = []
        }
      }

      const workspacePath = recentWorkspacePaths[0] ?? null

      set({
        isLoading: false,
        workspacePath,
        recentWorkspacePaths,
        entries: [],
        isTreeLoading: Boolean(workspacePath),
        expandedDirectories: {},
      })

      if (workspacePath) {
        get().refreshWorkspaceEntries()
      }
    } catch (error) {
      console.error('Failed to initialize workspace:', error)
      set({
        isLoading: false,
        workspacePath: null,
        recentWorkspacePaths: [],
        entries: [],
        isTreeLoading: false,
        expandedDirectories: {},
      })
    }
  },

  setWorkspace: (path: string) => {
    try {
      const recentWorkspacePaths = get().recentWorkspacePaths

      const updatedHistory = [
        path,
        ...recentWorkspacePaths.filter((entry) => entry !== path),
      ].slice(0, MAX_HISTORY_LENGTH)

      localStorage.setItem(
        WORKSPACE_HISTORY_KEY,
        JSON.stringify(updatedHistory)
      )

      set({
        isLoading: false,
        workspacePath: path,
        recentWorkspacePaths: updatedHistory,
        entries: [],
        isTreeLoading: true,
        expandedDirectories: {},
      })

      get().refreshWorkspaceEntries()
    } catch (error) {
      console.error('Failed to set workspace:', error)
    }
  },

  openFolderPicker: async () => {
    try {
      const path = await open({
        multiple: false,
        directory: true,
        title: 'Select Workspace Folder',
      })

      if (path) {
        get().setWorkspace(path)
      }
    } catch (error) {
      console.error('Failed to open folder picker:', error)
    }
  },

  refreshWorkspaceEntries: async () => {
    const workspacePath = get().workspacePath

    if (!workspacePath) {
      set({ entries: [], isTreeLoading: false })
      return
    }

    set({ isTreeLoading: true })

    try {
      const entries = await buildWorkspaceEntries(workspacePath)

      if (get().workspacePath !== workspacePath) {
        return
      }

      set((state) => ({
        entries,
        isTreeLoading: false,
        expandedDirectories: syncExpandedDirectoriesWithEntries(
          state.expandedDirectories,
          entries
        ),
      }))
    } catch (error) {
      console.error('Failed to refresh workspace entries:', error)

      if (get().workspacePath === workspacePath) {
        set({ entries: [], isTreeLoading: false })
      }
    }
  },

  toggleDirectory: (path: string) => {
    set((state) => {
      const nextValue = !(state.expandedDirectories[path] ?? false)

      return {
        expandedDirectories: {
          ...state.expandedDirectories,
          [path]: nextValue,
        },
      }
    })
  },

  createFolder: async (directoryPath: string) => {
    const workspacePath = get().workspacePath

    if (!workspacePath) {
      return null
    }

    try {
      const baseName = 'Untitled Folder'
      let attempt = 0
      let folderName = baseName
      let folderPath = await join(directoryPath, folderName)

      while (await exists(folderPath)) {
        attempt += 1
        folderName = `${baseName} ${attempt}`
        folderPath = await join(directoryPath, folderName)
      }

      await mkdir(folderPath, { recursive: true })

      set((state) => ({
        expandedDirectories: {
          ...state.expandedDirectories,
          [directoryPath]: true,
          [folderPath]: true,
        },
      }))

      await get().refreshWorkspaceEntries()

      return folderPath
    } catch (error) {
      console.error('Failed to create folder:', error)
      return null
    }
  },

  createNote: async (directoryPath: string) => {
    const workspacePath = get().workspacePath

    if (!workspacePath) {
      return null
    }

    try {
      const baseName = 'Untitled'
      let attempt = 0
      let fileName = `${baseName}.md`
      let filePath = await join(directoryPath, fileName)

      while (await exists(filePath)) {
        attempt += 1
        fileName = `${baseName} ${attempt}.md`
        filePath = await join(directoryPath, fileName)
      }

      await writeTextFile(filePath, '')

      set((state) => ({
        expandedDirectories: {
          ...state.expandedDirectories,
          [directoryPath]: true,
        },
      }))

      await get().refreshWorkspaceEntries()

      return filePath
    } catch (error) {
      console.error('Failed to create note:', error)
      return null
    }
  },

  deleteEntry: async (path: string) => {
    try {
      const { closeTab } = useTabStore.getState()
      closeTab(path)

      await invoke('move_to_trash', { path })
      await get().refreshWorkspaceEntries()

      return true
    } catch (error) {
      console.error('Failed to delete entry:', path, error)
      return false
    }
  },

  renameEntry: async (entry, newName) => {
    const trimmedName = newName.trim()

    if (!trimmedName || trimmedName === entry.name) {
      return entry.path
    }

    if (trimmedName.includes('/') || trimmedName.includes('\\')) {
      console.warn('Invalid rename target, contains path separators:', newName)
      return null
    }

    try {
      const directoryPath = await dirname(entry.path)
      const nextPath = await join(directoryPath, trimmedName)

      if (nextPath === entry.path) {
        return entry.path
      }

      if (await exists(nextPath)) {
        console.warn('Cannot rename, target already exists:', nextPath)
        return null
      }

      await rename(entry.path, nextPath)

      if (entry.isDirectory) {
        set((state) => ({
          expandedDirectories: renameExpandedDirectories(
            state.expandedDirectories,
            entry.path,
            nextPath
          ),
        }))
      }

      const { renameTab } = useTabStore.getState()
      renameTab(entry.path, nextPath)

      await get().refreshWorkspaceEntries()

      return nextPath
    } catch (error) {
      console.error('Failed to rename entry:', entry.path, error)
      return null
    }
  },
}))

async function buildWorkspaceEntries(
  path: string,
  visited: Set<string> = new Set<string>()
): Promise<WorkspaceEntry[]> {
  if (visited.has(path)) {
    return []
  }

  visited.add(path)

  try {
    const rawEntries = await readDir(path)
    const visibleEntries = rawEntries.filter(
      (entry) => Boolean(entry.name) && !entry.name.startsWith('.')
    )

    const entries = await Promise.all(
      visibleEntries.map(async (entry) => {
        const fullPath = await join(path, entry.name)
        const workspaceEntry: WorkspaceEntry = {
          path: fullPath,
          name: entry.name,
          isDirectory: entry.isDirectory,
        }

        if (entry.isDirectory) {
          try {
            if (visited.has(fullPath)) {
              console.warn(
                'Detected cyclic workspace entry, skipping recursion:',
                fullPath
              )
              workspaceEntry.children = []
            } else {
              const children = await buildWorkspaceEntries(fullPath, visited)
              workspaceEntry.children = children
            }
          } catch (error) {
            console.error('Failed to build workspace entry:', fullPath, error)
            workspaceEntry.children = []
          }
        }

        return workspaceEntry
      })
    )

    return sortWorkspaceEntries(entries)
  } catch (error) {
    console.error('Failed to read directory:', path, error)
    return []
  }
}

function sortWorkspaceEntries(entries: WorkspaceEntry[]): WorkspaceEntry[] {
  return entries
    .map((entry) => ({
      ...entry,
      children: entry.children
        ? sortWorkspaceEntries(entry.children)
        : undefined,
    }))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }

      return a.name.localeCompare(b.name)
    })
}

// Drops expanded-directory flags that no longer exist in the refreshed tree.
function syncExpandedDirectoriesWithEntries(
  expanded: Record<string, boolean>,
  entries: WorkspaceEntry[]
): Record<string, boolean> {
  const validDirectories = new Set<string>()
  collectDirectoryPaths(entries, validDirectories)

  const normalized: Record<string, boolean> = {}

  for (const path of validDirectories) {
    if (expanded[path]) {
      normalized[path] = true
    }
  }

  return normalized
}

function collectDirectoryPaths(
  entries: WorkspaceEntry[],
  accumulator: Set<string>
) {
  for (const entry of entries) {
    if (!entry.isDirectory) continue
    accumulator.add(entry.path)
    if (entry.children) {
      collectDirectoryPaths(entry.children, accumulator)
    }
  }
}

function renameExpandedDirectories(
  expanded: Record<string, boolean>,
  oldPath: string,
  newPath: string
): Record<string, boolean> {
  if (oldPath === newPath) {
    return expanded
  }

  const next: Record<string, boolean> = {}
  const oldPrefix = `${oldPath}/`
  const newPrefix = `${newPath}/`

  for (const [path, isExpanded] of Object.entries(expanded)) {
    if (!isExpanded) continue

    if (path === oldPath) {
      next[newPath] = true
      continue
    }

    if (path.startsWith(oldPrefix)) {
      const suffix = path.slice(oldPrefix.length)
      next[`${newPrefix}${suffix}`] = true
      continue
    }

    next[path] = true
  }

  return next
}
