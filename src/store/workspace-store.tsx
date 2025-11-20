import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { invoke } from '@tauri-apps/api/core'
import { dirname, join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  rename,
  stat,
  writeTextFile,
} from '@tauri-apps/plugin-fs'
import { generateText } from 'ai'
import { ollama } from 'ollama-ai-provider-v2'
import { toast } from 'sonner'
import { create } from 'zustand'

import { type ChatConfig, useAISettingsStore } from './ai-settings-store'
import { useFileExplorerSelectionStore } from './file-explorer-selection-store'
import { useTabStore } from './tab-store'
import { useTagStore } from './tag-store'
import {
  addEntryToState,
  buildWorkspaceEntries,
  moveEntryInState,
  removeEntriesFromState,
  sortWorkspaceEntries,
  updateChildPathsForMove,
  updateEntryInState,
  updateEntryMetadata,
} from './workspace/utils/entry-utils'
import {
  removeExpandedDirectories,
  renameExpandedDirectories,
  syncExpandedDirectoriesWithEntries,
} from './workspace/utils/expanded-directories-utils'
import { rewriteMarkdownRelativeLinks } from './workspace/utils/markdown-link-utils'
import {
  filterPinsForWorkspace,
  filterPinsWithEntries,
  persistPinnedDirectories,
  readPinnedDirectories,
  removePinsForPaths,
  renamePinnedDirectories,
} from './workspace/utils/pinned-directories-utils'
import { waitForUnsavedTabToSettle } from './workspace/utils/tab-save-utils'

const MAX_HISTORY_LENGTH = 5

const ensureWorkspaceMigrations = async (workspacePath: string) => {
  if (!workspacePath) {
    return
  }

  try {
    await invoke('apply_workspace_migrations', { workspacePath })
  } catch (error) {
    console.error('Failed to apply workspace migrations:', error)
    throw error
  }
}

export type WorkspaceEntry = {
  path: string
  name: string
  isDirectory: boolean
  children?: WorkspaceEntry[]
  createdAt?: Date
  modifiedAt?: Date
  tagSimilarity?: number
}

type WorkspaceStore = {
  isLoading: boolean
  workspacePath: string | null
  recentWorkspacePaths: string[]
  isTreeLoading: boolean
  entries: WorkspaceEntry[]
  expandedDirectories: Record<string, boolean>
  currentCollectionPath: string | null
  lastCollectionPath: string | null
  isMigrationsComplete: boolean
  pinnedDirectories: string[]
  setExpandedDirectories: (
    action: (
      expandedDirectories: Record<string, boolean>
    ) => Record<string, boolean>
  ) => void
  setCurrentCollectionPath: (
    path: string | null | ((prev: string | null) => string | null)
  ) => void
  toggleCollectionView: () => void
  initializeWorkspace: () => Promise<void>
  setWorkspace: (path: string) => Promise<void>
  openFolderPicker: () => Promise<void>
  refreshWorkspaceEntries: () => Promise<void>
  pinDirectory: (path: string) => Promise<void>
  unpinDirectory: (path: string) => Promise<void>
  toggleDirectory: (path: string) => void
  createFolder: (directoryPath: string) => Promise<string | null>
  createNote: (directoryPath: string) => Promise<string | null>
  createAndOpenNote: () => Promise<void>
  deleteEntries: (paths: string[]) => Promise<boolean>
  deleteEntry: (path: string) => Promise<boolean>
  renameNoteWithAI: (entry: WorkspaceEntry) => Promise<void>
  renameEntry: (
    entry: WorkspaceEntry,
    newName: string
  ) => Promise<string | null>
  moveEntry: (sourcePath: string, destinationPath: string) => Promise<boolean>
  updateEntryModifiedDate: (path: string) => Promise<void>
}

const WORKSPACE_HISTORY_KEY = 'workspace-history'

const findDirectoryEntry = (
  entries: WorkspaceEntry[],
  targetPath: string
): WorkspaceEntry | null => {
  for (const entry of entries) {
    if (entry.isDirectory && entry.path === targetPath) {
      return entry
    }
    if (entry.children) {
      const found = findDirectoryEntry(entry.children, targetPath)
      if (found) {
        return found
      }
    }
  }
  return null
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  isLoading: true,
  workspacePath: null,
  recentWorkspacePaths: [],
  isTreeLoading: false,
  entries: [],
  expandedDirectories: {},
  currentCollectionPath: null,
  lastCollectionPath: null,
  isMigrationsComplete: false,
  pinnedDirectories: [],

  setExpandedDirectories: (action) => {
    set((state) => ({ expandedDirectories: action(state.expandedDirectories) }))
  },

  setCurrentCollectionPath: (path) => {
    set((state) => {
      const nextPath =
        typeof path === 'function' ? path(state.currentCollectionPath) : path
      return {
        currentCollectionPath: nextPath,
        lastCollectionPath:
          nextPath !== null ? nextPath : state.lastCollectionPath,
      }
    })
  },

  toggleCollectionView: () => {
    const { currentCollectionPath, lastCollectionPath } = get()
    if (currentCollectionPath !== null) {
      // Close the view
      set({ currentCollectionPath: null })
    } else if (lastCollectionPath !== null) {
      // Restore the last opened path
      set({ currentCollectionPath: lastCollectionPath })
    }
  },

  initializeWorkspace: async () => {
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
        currentCollectionPath: null,
        lastCollectionPath: null,
        isMigrationsComplete: false,
        pinnedDirectories: [],
      })

      if (workspacePath) {
        const pinnedDirectories = await readPinnedDirectories(workspacePath)
        // Avoid overwriting if workspace changed mid-load
        if (get().workspacePath === workspacePath) {
          set({
            pinnedDirectories: filterPinsForWorkspace(
              pinnedDirectories,
              workspacePath
            ),
          })
        }
        try {
          await ensureWorkspaceMigrations(workspacePath)
          // Verify workspace path still matches before marking migrations complete
          if (get().workspacePath === workspacePath) {
            set({ isMigrationsComplete: true })
          }
        } catch (error) {
          console.error('Failed to apply workspace migrations:', error)
          // Only set to false if this workspace is still active
          if (get().workspacePath === workspacePath) {
            set({ isMigrationsComplete: false })
          }
        }
        get().refreshWorkspaceEntries()
        useTagStore.getState().loadTags(workspacePath)
      } else {
        set({ isMigrationsComplete: true })
        useTagStore.getState().loadTags(null)
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
        currentCollectionPath: null,
        lastCollectionPath: null,
        isMigrationsComplete: false,
        pinnedDirectories: [],
      })
    }
  },

  setWorkspace: async (path: string) => {
    try {
      const { tab, closeTab, clearHistory } = useTabStore.getState()
      const prevWorkspacePath = get().workspacePath

      if (tab) {
        closeTab(tab.path)
      }

      clearHistory()

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
        currentCollectionPath: null,
        isMigrationsComplete: false,
        pinnedDirectories: [],
      })

      const pinnedDirectories = await readPinnedDirectories(path)
      if (get().workspacePath === path) {
        set({
          pinnedDirectories: filterPinsForWorkspace(pinnedDirectories, path),
        })
      }
      try {
        await ensureWorkspaceMigrations(path)
        // Verify workspace path still matches before marking migrations complete
        if (get().workspacePath === path) {
          set({ isMigrationsComplete: true })
        }
      } catch (error) {
        console.error('Failed to apply workspace migrations:', error)
        // Only set to false if this workspace is still active
        if (get().workspacePath === path) {
          set({ isMigrationsComplete: false })
        }
      }
      get().refreshWorkspaceEntries()
      useTagStore.getState().loadTags(path)
      if (prevWorkspacePath && prevWorkspacePath !== path) {
        useTagStore.getState().invalidateTagCache()
      }
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
      set({ entries: [], isTreeLoading: false, pinnedDirectories: [] })
      return
    }

    set({ isTreeLoading: true })

    try {
      const entries = await buildWorkspaceEntries(workspacePath)

      if (get().workspacePath !== workspacePath) {
        return
      }

      const prevPinned = get().pinnedDirectories
      const nextPinned = filterPinsWithEntries(
        filterPinsForWorkspace(prevPinned, workspacePath),
        entries,
        workspacePath
      )
      const pinsChanged =
        prevPinned.length !== nextPinned.length ||
        prevPinned.some((path, index) => path !== nextPinned[index])

      set((state) => ({
        entries,
        isTreeLoading: false,
        expandedDirectories: syncExpandedDirectoriesWithEntries(
          state.expandedDirectories,
          entries
        ),
        ...(pinsChanged ? { pinnedDirectories: nextPinned } : {}),
      }))

      if (pinsChanged && get().workspacePath === workspacePath) {
        await persistPinnedDirectories(workspacePath, nextPinned)
      }
    } catch (error) {
      console.error('Failed to refresh workspace entries:', error)

      if (get().workspacePath === workspacePath) {
        set({ entries: [], isTreeLoading: false })
      }
    }
  },

  pinDirectory: async (path: string) => {
    const workspacePath = get().workspacePath
    if (!workspacePath) {
      return
    }

    const withinWorkspace = filterPinsForWorkspace([path], workspacePath)
    if (withinWorkspace.length === 0) {
      return
    }

    const isDirectory =
      path === workspacePath || Boolean(findDirectoryEntry(get().entries, path))
    if (!isDirectory) {
      return
    }

    const prevPinned = get().pinnedDirectories
    if (prevPinned.includes(path)) {
      return
    }

    const nextPinned = [...prevPinned, path]
    set({ pinnedDirectories: nextPinned })
    await persistPinnedDirectories(workspacePath, nextPinned)
  },

  unpinDirectory: async (path: string) => {
    const workspacePath = get().workspacePath
    if (!workspacePath) return

    const prevPinned = get().pinnedDirectories
    const nextPinned = prevPinned.filter((entry) => entry !== path)
    if (nextPinned.length === prevPinned.length) {
      return
    }
    set({ pinnedDirectories: nextPinned })
    await persistPinnedDirectories(workspacePath, nextPinned)
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

      const newFolderEntry: WorkspaceEntry = {
        path: folderPath,
        name: folderName,
        isDirectory: true,
        children: [],
      }

      set((state) => {
        const updatedEntries =
          directoryPath === workspacePath
            ? sortWorkspaceEntries([...state.entries, newFolderEntry])
            : addEntryToState(state.entries, directoryPath, newFolderEntry)

        return {
          entries: updatedEntries,
          expandedDirectories: {
            ...state.expandedDirectories,
            [directoryPath]: true,
            [folderPath]: true,
          },
          currentCollectionPath: folderPath,
        }
      })

      const { setSelectedEntryPaths, setSelectionAnchorPath } =
        useFileExplorerSelectionStore.getState()
      setSelectedEntryPaths(new Set([folderPath]))
      setSelectionAnchorPath(folderPath)

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

      // Fetch file metadata
      const fileMetadata: { createdAt?: Date; modifiedAt?: Date } = {}
      try {
        const statResult = await stat(filePath)
        if (statResult.birthtime) {
          fileMetadata.createdAt = new Date(statResult.birthtime)
        }
        if (statResult.mtime) {
          fileMetadata.modifiedAt = new Date(statResult.mtime)
        }
      } catch (error) {
        // Silently fail if metadata cannot be retrieved
        console.debug('Failed to get metadata for:', filePath, error)
      }

      const newFileEntry: WorkspaceEntry = {
        path: filePath,
        name: fileName,
        isDirectory: false,
        ...fileMetadata,
      }

      set((state) => {
        const updatedEntries =
          directoryPath === workspacePath
            ? sortWorkspaceEntries([...state.entries, newFileEntry])
            : addEntryToState(state.entries, directoryPath, newFileEntry)

        return {
          entries: updatedEntries,
        }
      })

      const { setSelectedEntryPaths, setSelectionAnchorPath } =
        useFileExplorerSelectionStore.getState()
      setSelectedEntryPaths(new Set([filePath]))
      setSelectionAnchorPath(filePath)

      return filePath
    } catch (error) {
      console.error('Failed to create note:', error)
      return null
    }
  },

  createAndOpenNote: async () => {
    const workspacePath = get().workspacePath

    if (!workspacePath) {
      return
    }

    try {
      const { tab, openTab } = useTabStore.getState()
      const { currentCollectionPath } = get()
      let targetDirectory = workspacePath

      // Priority: currentCollectionPath > tab directory > workspace root
      if (currentCollectionPath) {
        targetDirectory = currentCollectionPath
      } else if (tab) {
        targetDirectory = await dirname(tab.path)
      }

      const newNotePath = await get().createNote(targetDirectory)

      if (newNotePath) {
        await openTab(newNotePath)
      }
    } catch (error) {
      console.error('Failed to create and open note:', error)
    }
  },

  deleteEntries: async (paths: string[]) => {
    try {
      let tabState = useTabStore.getState()
      const activeTabPath = tabState.tab?.path

      if (activeTabPath && paths.includes(activeTabPath)) {
        tabState = await waitForUnsavedTabToSettle(activeTabPath, () =>
          useTabStore.getState()
        )
        tabState.closeTab(activeTabPath)
      }

      if (paths.length === 1) {
        await invoke('move_to_trash', { path: paths[0] })
      } else {
        await invoke('move_many_to_trash', { paths })
      }

      // Remove deleted paths from history
      for (const path of paths) {
        tabState.removePathFromHistory(path)
      }

      // Update currentCollectionPath and lastCollectionPath if they're being deleted
      const { currentCollectionPath, lastCollectionPath } = get()
      const shouldClearCurrentCollectionPath =
        currentCollectionPath && paths.includes(currentCollectionPath)
      const shouldClearLastCollectionPath =
        lastCollectionPath && paths.includes(lastCollectionPath)

      if (shouldClearCurrentCollectionPath || shouldClearLastCollectionPath) {
        set({
          currentCollectionPath: shouldClearCurrentCollectionPath
            ? null
            : currentCollectionPath,
          lastCollectionPath: shouldClearLastCollectionPath
            ? null
            : lastCollectionPath,
        })
      }

      // If deleting from a tag collection, also remove from tagEntries
      if (currentCollectionPath?.startsWith('#')) {
        useTagStore.getState().removeTagEntries(paths)
      }

      // Remove deleted entries from state without full refresh
      const workspacePath = get().workspacePath
      let nextPinned: string[] | null = null

      set((state) => {
        const filteredPins = removePinsForPaths(state.pinnedDirectories, paths)
        const pinsChanged =
          filteredPins.length !== state.pinnedDirectories.length

        if (pinsChanged) {
          nextPinned = filteredPins
        }

        return {
          entries: removeEntriesFromState(state.entries, paths),
          expandedDirectories: removeExpandedDirectories(
            state.expandedDirectories,
            paths
          ),
          ...(pinsChanged ? { pinnedDirectories: filteredPins } : {}),
        }
      })

      if (
        workspacePath &&
        nextPinned &&
        get().workspacePath === workspacePath
      ) {
        await persistPinnedDirectories(workspacePath, nextPinned)
      }

      return true
    } catch (error) {
      console.error('Failed to delete entries:', paths, error)
      return false
    }
  },

  deleteEntry: async (path: string) => {
    return get().deleteEntries([path])
  },

  renameNoteWithAI: async (entry) => {
    const renameConfig = useAISettingsStore.getState().renameConfig

    if (!renameConfig) {
      return
    }

    if (entry.isDirectory || !entry.path.endsWith('.md')) {
      toast.error('AI rename is only available for Markdown notes', {
        position: 'bottom-left',
      })
      return
    }

    try {
      const [directoryPath, rawContent] = await Promise.all([
        dirname(entry.path),
        readTextFile(entry.path),
      ])

      const otherNoteNames = await collectSiblingNoteNames(
        directoryPath,
        entry.name
      )

      const model = createModelFromConfig(renameConfig)

      const aiResponse = await generateText({
        model,
        system: AI_RENAME_SYSTEM_PROMPT,
        temperature: 0.3,
        prompt: buildRenamePrompt({
          currentName: entry.name,
          otherNoteNames,
          content: rawContent,
          directoryPath,
        }),
      })

      const suggestedBaseName = sanitizeFileName(extractName(aiResponse.text))

      if (!suggestedBaseName) {
        throw new Error('The AI did not return a usable name.')
      }

      const extension = getFileExtension(entry.name) ?? '.md'

      const { fileName: finalFileName } = await ensureUniqueFileName(
        directoryPath,
        suggestedBaseName,
        extension,
        entry.path
      )

      const renamedPath = await get().renameEntry(entry, finalFileName)

      if (!renamedPath) {
        throw new Error('Could not apply the AI-generated name.')
      }

      const displayName = stripExtension(finalFileName, extension)
      const { tab, openNote } = useTabStore.getState()

      toast.success(`Renamed note to “${displayName}”`, {
        position: 'bottom-left',
        action:
          tab?.path === renamedPath
            ? undefined
            : {
                label: 'Open',
                onClick: () => {
                  openNote(renamedPath)
                },
              },
      })
    } catch (error) {
      console.error('Failed to rename note with AI:', entry.path, error)

      toast.error('Failed to rename with AI', {
        description: error instanceof Error ? error.message : undefined,
        position: 'bottom-left',
      })
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
      const tabState = await waitForUnsavedTabToSettle(entry.path, () =>
        useTabStore.getState()
      )

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

      await tabState.renameTab(entry.path, nextPath)
      tabState.updateHistoryPath(entry.path, nextPath)

      // If renaming in a tag collection, also update tagEntries
      const { currentCollectionPath } = get()
      if (currentCollectionPath?.startsWith('#')) {
        useTagStore.getState().updateTagEntry(entry.path, nextPath, trimmedName)
      }

      const workspacePath = get().workspacePath
      let nextPinned: string[] | null = null

      set((state) => {
        const updatedPins = entry.isDirectory
          ? renamePinnedDirectories(
              state.pinnedDirectories,
              entry.path,
              nextPath
            )
          : state.pinnedDirectories
        const pinsChanged =
          updatedPins.length !== state.pinnedDirectories.length ||
          updatedPins.some(
            (path, index) => path !== state.pinnedDirectories[index]
          )

        if (pinsChanged) {
          nextPinned = updatedPins
        }

        const updatedExpanded = entry.isDirectory
          ? renameExpandedDirectories(
              state.expandedDirectories,
              entry.path,
              nextPath
            )
          : state.expandedDirectories

        return {
          entries: updateEntryInState(
            state.entries,
            entry.path,
            nextPath,
            trimmedName
          ),
          expandedDirectories: updatedExpanded,
          currentCollectionPath:
            entry.isDirectory && state.currentCollectionPath === entry.path
              ? nextPath
              : state.currentCollectionPath,
          ...(pinsChanged ? { pinnedDirectories: updatedPins } : {}),
        }
      })

      if (
        workspacePath &&
        nextPinned &&
        get().workspacePath === workspacePath
      ) {
        await persistPinnedDirectories(workspacePath, nextPinned)
      }

      return nextPath
    } catch (error) {
      console.error('Failed to rename entry:', entry.path, error)
      return null
    }
  },

  moveEntry: async (sourcePath: string, destinationPath: string) => {
    const workspacePath = get().workspacePath

    // Validation 1: Check if workspace is set
    if (!workspacePath) {
      console.error('No workspace set')
      return false
    }

    // Validation 2: Prevent moving to itself
    if (sourcePath === destinationPath) {
      console.error('Cannot move entry to itself')
      return false
    }

    // Validation 3: Check if destination is a child of source (prevent parent moves into children)
    const destinationIsChildOfSource =
      destinationPath.startsWith(`${sourcePath}/`) ||
      destinationPath.startsWith(`${sourcePath}\\`)

    if (destinationIsChildOfSource) {
      console.error('Cannot move entry to its own parent')
      return false
    }

    // Validation 4: Ensure both paths are within workspace
    const sourceInWorkspace =
      sourcePath === workspacePath || sourcePath.startsWith(`${workspacePath}/`)
    const destinationInWorkspace =
      destinationPath === workspacePath ||
      destinationPath.startsWith(`${workspacePath}/`)

    if (!sourceInWorkspace || !destinationInWorkspace) {
      console.error('Source or destination is outside workspace')
      return false
    }

    try {
      const tabState = await waitForUnsavedTabToSettle(sourcePath, () =>
        useTabStore.getState()
      )

      // Get the file/folder name from source path
      const fileName =
        sourcePath.split('/').pop() || sourcePath.split('\\').pop()
      if (!fileName) {
        console.error('Could not extract file name from source path')
        return false
      }

      // Construct the new path
      const newPath = await join(destinationPath, fileName)

      // Check if destination already has this item
      if (await exists(newPath)) {
        console.error('Destination already contains this item')
        return false
      }

      let markdownRewriteContext: {
        content: string
        sourceDir: string
      } | null = null
      let shouldRefreshTab = false

      if (MARKDOWN_EXT_REGEX.test(fileName)) {
        try {
          const sourceDirectory = await dirname(sourcePath)
          if (sourceDirectory !== destinationPath) {
            const noteContent = await readTextFile(sourcePath)
            markdownRewriteContext = {
              content: noteContent,
              sourceDir: sourceDirectory,
            }
          }
        } catch (error) {
          console.error('Failed to prepare markdown link updates:', error)
        }
      }

      await rename(sourcePath, newPath)

      if (markdownRewriteContext) {
        try {
          const updatedContent = rewriteMarkdownRelativeLinks(
            markdownRewriteContext.content,
            markdownRewriteContext.sourceDir,
            destinationPath
          )

          if (updatedContent !== markdownRewriteContext.content) {
            await writeTextFile(newPath, updatedContent)
            shouldRefreshTab = true
          }
        } catch (error) {
          console.error('Failed to rewrite markdown links after move:', error)
        }
      }

      // Update tab path if the moved file is currently open
      await tabState.renameTab(sourcePath, newPath, {
        refreshContent: shouldRefreshTab,
      })
      tabState.updateHistoryPath(sourcePath, newPath)

      // If moving in a tag collection, also update tagEntries
      const { currentCollectionPath } = get()
      if (currentCollectionPath?.startsWith('#')) {
        useTagStore.getState().updateTagEntry(sourcePath, newPath, fileName)
      }

      // Update currentCollectionPath if it's being moved
      const shouldUpdateCollectionPath = currentCollectionPath === sourcePath

      // Find the entry to move before set() to determine if it's a directory
      const findEntry = (
        entryList: WorkspaceEntry[],
        targetPath: string
      ): WorkspaceEntry | null => {
        for (const entry of entryList) {
          if (entry.path === targetPath) {
            return entry
          }
          if (entry.children) {
            const found = findEntry(entry.children, targetPath)
            if (found) {
              return found
            }
          }
        }
        return null
      }

      const currentState = get()
      const entryToMove = findEntry(currentState.entries, sourcePath)
      const isDirectory = entryToMove?.isDirectory ?? false

      let nextPinned: string[] | null = null

      set((state) => {
        let updatedEntries: WorkspaceEntry[]

        if (destinationPath === workspacePath) {
          // Moving to workspace root - add directly to entries array
          // First, remove from source location
          const removeEntry = (
            entryList: WorkspaceEntry[]
          ): WorkspaceEntry[] => {
            return entryList
              .filter((entry) => entry.path !== sourcePath)
              .map((entry) => {
                if (entry.children) {
                  return {
                    ...entry,
                    children: removeEntry(entry.children),
                  }
                }
                return entry
              })
          }

          const filteredEntries = removeEntry(state.entries)

          if (entryToMove) {
            // Update paths if it's a directory
            let updatedEntryToMove: WorkspaceEntry
            if (entryToMove.isDirectory) {
              updatedEntryToMove = {
                path: newPath,
                name: entryToMove.name,
                isDirectory: true,
                children: entryToMove.children
                  ? entryToMove.children.map((child: WorkspaceEntry) =>
                      updateChildPathsForMove(child, sourcePath, newPath)
                    )
                  : undefined,
                createdAt: entryToMove.createdAt,
                modifiedAt: entryToMove.modifiedAt,
              }
            } else {
              updatedEntryToMove = {
                path: newPath,
                name: entryToMove.name,
                isDirectory: false,
                createdAt: entryToMove.createdAt,
                modifiedAt: entryToMove.modifiedAt,
              }
            }

            // Add directly to entries array
            updatedEntries = sortWorkspaceEntries([
              ...filteredEntries,
              updatedEntryToMove,
            ])
          } else {
            updatedEntries = filteredEntries
          }
        } else {
          // Moving to a subdirectory - use existing logic
          updatedEntries = moveEntryInState(
            state.entries,
            sourcePath,
            destinationPath
          )
        }

        const updatedExpanded = isDirectory
          ? renameExpandedDirectories(
              state.expandedDirectories,
              sourcePath,
              newPath
            )
          : state.expandedDirectories

        const updatedPinned = isDirectory
          ? renamePinnedDirectories(
              state.pinnedDirectories,
              sourcePath,
              newPath
            )
          : state.pinnedDirectories
        const pinsChanged =
          updatedPinned.length !== state.pinnedDirectories.length ||
          updatedPinned.some(
            (path, index) => path !== state.pinnedDirectories[index]
          )

        if (pinsChanged) {
          nextPinned = updatedPinned
        }

        return {
          entries: updatedEntries,
          expandedDirectories: updatedExpanded,
          currentCollectionPath: shouldUpdateCollectionPath
            ? newPath
            : state.currentCollectionPath,
          ...(pinsChanged ? { pinnedDirectories: updatedPinned } : {}),
        }
      })

      if (
        workspacePath &&
        nextPinned &&
        get().workspacePath === workspacePath
      ) {
        await persistPinnedDirectories(workspacePath, nextPinned)
      }

      return true
    } catch (error) {
      console.error('Failed to move entry:', sourcePath, destinationPath, error)
      return false
    }
  },

  updateEntryModifiedDate: async (path: string) => {
    try {
      const fileMetadata = await stat(path)
      const metadata: { modifiedAt?: Date; createdAt?: Date } = {}

      if (fileMetadata.mtime) {
        metadata.modifiedAt = new Date(fileMetadata.mtime)
      }
      if (fileMetadata.birthtime) {
        metadata.createdAt = new Date(fileMetadata.birthtime)
      }

      set((state) => ({
        entries: updateEntryMetadata(state.entries, path, metadata),
      }))
    } catch (error) {
      // Silently fail if metadata cannot be retrieved
      console.debug('Failed to update entry modified date:', path, error)
    }
  },
}))

const AI_RENAME_SYSTEM_PROMPT = `You are an assistant that suggests concise, unique titles for markdown notes. 
Return only the new title without a file extension. 
Keep it under 60 characters and avoid special characters like / \\ : * ? " < > |.`
const MAX_NOTE_CONTEXT_LENGTH = 4000

// Regex patterns for filename sanitization
const MARKDOWN_EXT_REGEX = /\.md$/i
const INVALID_FILENAME_CHARS_REGEX = /[<>:"/\\|?*]/g
const MULTIPLE_WHITESPACE_REGEX = /\s+/g
const TRAILING_DOTS_REGEX = /\.+$/

function createModelFromConfig(config: ChatConfig) {
  switch (config.provider) {
    case 'anthropic':
      return createAnthropic({
        apiKey: config.apiKey,
      })(config.model)
    case 'google':
      return createGoogleGenerativeAI({
        apiKey: config.apiKey,
      })(config.model)
    case 'openai':
      return createOpenAI({
        apiKey: config.apiKey,
      })(config.model)
    case 'ollama':
      return ollama(config.model)
    default:
      throw new Error(`Unsupported provider: ${config.provider}`)
  }
}

async function collectSiblingNoteNames(
  directoryPath: string,
  currentFileName: string
): Promise<string[]> {
  try {
    const entries = await readDir(directoryPath)

    return entries
      .filter(
        (entry) =>
          Boolean(entry.name) &&
          entry.name !== currentFileName &&
          !entry.name?.startsWith('.') &&
          entry.name?.toLowerCase().endsWith('.md')
      )
      .map((entry) => stripExtension(entry.name as string, '.md').trim())
      .filter((name) => name.length > 0)
      .slice(0, 30)
  } catch (error) {
    console.error('Failed to read sibling notes:', directoryPath, error)
    return []
  }
}

function buildRenamePrompt({
  currentName,
  otherNoteNames,
  content,
  directoryPath,
}: {
  currentName: string
  otherNoteNames: string[]
  content: string
  directoryPath: string
}) {
  const truncatedContent =
    content.length > MAX_NOTE_CONTEXT_LENGTH
      ? `${content.slice(0, MAX_NOTE_CONTEXT_LENGTH)}\n…`
      : content

  const others =
    otherNoteNames.length > 0
      ? otherNoteNames.map((name) => `- ${name}`).join('\n')
      : 'None'

  return `Generate a better file name for a markdown note. 
- The note is currently called "${stripExtension(currentName, '.md')}".
- The note resides in the folder: ${directoryPath}.
- Other notes in this folder:\n${others}

Note content:
---
${truncatedContent}
---

Respond with a single title (no quotes, no markdown, no extension).`
}

function extractName(raw: string) {
  return raw
    .split('\n')[0]
    .replace(/[`"'<>]/g, ' ')
    .trim()
}

function sanitizeFileName(name: string) {
  const withoutMd = name.replace(MARKDOWN_EXT_REGEX, '')
  const cleaned = withoutMd
    .replace(INVALID_FILENAME_CHARS_REGEX, ' ')
    .replace(MULTIPLE_WHITESPACE_REGEX, ' ')
    .replace(TRAILING_DOTS_REGEX, '')
    .trim()

  const truncated = cleaned.slice(0, 60).trim()

  return truncated
}

function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf('.')
  if (index <= 0) return ''
  return fileName.slice(index)
}

function stripExtension(fileName: string, extension: string) {
  return extension && fileName.toLowerCase().endsWith(extension.toLowerCase())
    ? fileName.slice(0, -extension.length)
    : fileName
}

async function ensureUniqueFileName(
  directoryPath: string,
  baseName: string,
  extension: string,
  currentPath: string
) {
  let attempt = 0

  // Always have a fallback extension for markdown notes
  const safeExtension = extension || '.md'

  while (attempt < 100) {
    const suffix = attempt === 0 ? '' : ` ${attempt}`
    const candidateBase = `${baseName}${suffix}`.trim()
    const candidateFileName = `${candidateBase}${safeExtension}`
    const nextPath = await join(directoryPath, candidateFileName)

    if (nextPath === currentPath) {
      return { fileName: candidateFileName, fullPath: nextPath }
    }

    if (!(await exists(nextPath))) {
      return { fileName: candidateFileName, fullPath: nextPath }
    }

    attempt += 1
  }

  throw new Error('Unable to find a unique filename.')
}
