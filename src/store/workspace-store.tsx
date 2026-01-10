import { invoke } from '@tauri-apps/api/core'
import { basename, dirname, join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { generateText } from 'ai'
import { resolve } from 'pathe'
import { toast } from 'sonner'
import { create } from 'zustand'
import type { WorkspaceSettings } from '@/lib/settings-utils'
import { loadSettings } from '@/lib/settings-utils'
import { FileSystemRepository } from '@/repositories/file-system-repository'
import { areStringArraysEqual } from '@/utils/array-utils'
import {
  getFileNameFromPath,
  isPathEqualOrDescendant,
  normalizePathSeparators,
} from '@/utils/path-utils'
import { useAISettingsStore } from './ai-settings-store'
import { useCollectionStore } from './collection-store'
import { useFileExplorerSelectionStore } from './file-explorer-selection-store'
import { useTabStore } from './tab-store'
import {
  AI_RENAME_SYSTEM_PROMPT,
  buildRenamePrompt,
  collectSiblingNoteNames,
  createModelFromConfig,
  extractAndSanitizeName,
} from './workspace/utils/ai-rename-utils'
import {
  addEntryToState,
  buildWorkspaceEntries,
  findEntryByPath,
  moveEntryInState,
  removeEntriesFromState,
  removeEntryFromState,
  sortWorkspaceEntries,
  updateChildPathsForMove,
  updateEntryInState,
  updateEntryMetadata,
} from './workspace/utils/entry-utils'
import {
  addExpandedDirectories,
  getExpandedDirectoriesFromSettings,
  persistExpandedDirectories,
  removeExpandedDirectories,
  renameExpandedDirectories,
  syncExpandedDirectoriesWithEntries,
  toggleExpandedDirectory,
} from './workspace/utils/expanded-directories-utils'
import { rewriteMarkdownRelativeLinks } from './workspace/utils/markdown-link-utils'
import {
  filterPinsForWorkspace,
  filterPinsWithEntries,
  getPinnedDirectoriesFromSettings,
  normalizePinnedDirectoriesList,
  persistPinnedDirectories,
  removePinsForPaths,
  renamePinnedDirectories,
} from './workspace/utils/pinned-directories-utils'
import { waitForUnsavedTabToSettle } from './workspace/utils/tab-save-utils'
import { generateUniqueFileName } from './workspace/utils/unique-filename-utils'
import {
  readWorkspaceHistory,
  removeFromWorkspaceHistory,
  writeWorkspaceHistory,
} from './workspace/utils/workspace-history-utils'

const MAX_HISTORY_LENGTH = 5

type WorkspaceStoreRepositories = {
  fileSystemRepository: FileSystemRepository
}

const buildWorkspaceState = (overrides?: Partial<WorkspaceStore>) => ({
  isLoading: false,
  workspacePath: null,
  recentWorkspacePaths: [],
  entries: [],
  isTreeLoading: false,
  expandedDirectories: [],
  isMigrationsComplete: false,
  pinnedDirectories: [],
  lastFsOperationTime: null,
  ...overrides,
})

export type WorkspaceEntry = {
  path: string
  name: string
  isDirectory: boolean
  children?: WorkspaceEntry[]
  createdAt?: Date
  modifiedAt?: Date
}

type WorkspaceStore = {
  isLoading: boolean
  workspacePath: string | null
  recentWorkspacePaths: string[]
  isTreeLoading: boolean
  entries: WorkspaceEntry[]
  expandedDirectories: string[]
  isMigrationsComplete: boolean
  pinnedDirectories: string[]
  lastFsOperationTime: number | null
  setExpandedDirectories: (
    action: (expandedDirectories: string[]) => string[]
  ) => Promise<void>
  initializeWorkspace: () => Promise<void>
  setWorkspace: (path: string) => Promise<void>
  openFolderPicker: () => Promise<void>
  refreshWorkspaceEntries: () => Promise<void>
  pinDirectory: (path: string) => Promise<void>
  unpinDirectory: (path: string) => Promise<void>
  toggleDirectory: (path: string) => Promise<void>
  createFolder: (
    directoryPath: string,
    folderName: string
  ) => Promise<string | null>
  createNote: (
    directoryPath: string,
    options?: { initialName?: string; initialContent?: string }
  ) => Promise<string>
  createAndOpenNote: () => Promise<void>
  deleteEntries: (paths: string[]) => Promise<void>
  deleteEntry: (path: string) => Promise<void>
  renameNoteWithAI: (entry: WorkspaceEntry) => Promise<void>
  renameEntry: (entry: WorkspaceEntry, newName: string) => Promise<string>
  moveEntry: (sourcePath: string, destinationPath: string) => Promise<boolean>
  copyEntry: (sourcePath: string, destinationPath: string) => Promise<boolean>
  moveExternalEntry: (
    sourcePath: string,
    destinationPath: string
  ) => Promise<boolean>
  updateEntryModifiedDate: (path: string) => Promise<void>
  recordFsOperation: () => void
  clearWorkspace: () => Promise<void>
}

export const createWorkspaceStore = ({
  fileSystemRepository,
}: WorkspaceStoreRepositories) =>
  create<WorkspaceStore>((set, get) => {
    const restoreLastOpenedNoteFromSettings = async (
      workspacePath: string,
      settings: WorkspaceSettings
    ) => {
      const relativePath = settings.lastOpenedNotePath
      if (!relativePath) {
        return
      }

      const absolutePath = resolve(workspacePath, relativePath)

      try {
        if (
          isPathEqualOrDescendant(absolutePath, workspacePath) &&
          (await fileSystemRepository.exists(absolutePath)) &&
          get().workspacePath === workspacePath
        ) {
          useTabStore
            .getState()
            .openTab(absolutePath)
            .catch((error) => {
              console.debug('Failed to open last opened note:', error)
            })
        }
      } catch (error) {
        console.debug('Failed to restore last opened note:', error)
      }
    }

    const bootstrapWorkspace = async (
      workspacePath: string,
      options?: { restoreLastOpenedNote?: boolean }
    ) => {
      let migrationsComplete = false

      try {
        await invoke('apply_workspace_migrations', { workspacePath })
        migrationsComplete = true
      } catch (error) {
        console.error('Failed to apply workspace migrations:', error)
        migrationsComplete = false
      }

      if (get().workspacePath !== workspacePath) {
        return
      }
      set({ isMigrationsComplete: migrationsComplete })

      try {
        const [settings, entries] = await Promise.all([
          loadSettings(workspacePath),
          buildWorkspaceEntries(workspacePath, fileSystemRepository),
        ])

        if (get().workspacePath !== workspacePath) {
          return
        }

        const pinsFromSettings = filterPinsForWorkspace(
          getPinnedDirectoriesFromSettings(workspacePath, settings),
          workspacePath
        )
        const nextPinned = filterPinsWithEntries(
          pinsFromSettings,
          entries,
          workspacePath
        )
        const pinsChanged = !areStringArraysEqual(pinsFromSettings, nextPinned)
        const expandedFromSettings = getExpandedDirectoriesFromSettings(
          workspacePath,
          settings
        )
        const syncedExpandedDirectories = syncExpandedDirectoriesWithEntries(
          expandedFromSettings,
          entries
        )

        set({
          entries,
          isTreeLoading: false,
          expandedDirectories: syncedExpandedDirectories,
          pinnedDirectories: nextPinned,
        })

        if (pinsChanged) {
          await persistPinnedDirectories(workspacePath, nextPinned)
        }

        const expandedChanged = !areStringArraysEqual(
          expandedFromSettings,
          syncedExpandedDirectories
        )

        if (expandedChanged) {
          persistExpandedDirectories(workspacePath, syncedExpandedDirectories)
        }

        if (options?.restoreLastOpenedNote) {
          await restoreLastOpenedNoteFromSettings(workspacePath, settings)
        }
      } catch (error) {
        if (get().workspacePath === workspacePath) {
          set({ isTreeLoading: false })
        }
        throw error
      }
    }

    return {
      ...buildWorkspaceState({ isLoading: true }),

      recordFsOperation: () => {
        set({ lastFsOperationTime: Date.now() })
      },

      setExpandedDirectories: async (action) => {
        const { workspacePath, expandedDirectories } = get()
        if (!workspacePath) throw new Error('Workspace path is not set')

        const previousExpanded = expandedDirectories
        const updatedExpanded = action(expandedDirectories)

        set({
          expandedDirectories: updatedExpanded,
        })

        if (!areStringArraysEqual(previousExpanded, updatedExpanded)) {
          await persistExpandedDirectories(workspacePath, updatedExpanded)
        }
      },

      initializeWorkspace: async () => {
        try {
          const recentWorkspacePaths = readWorkspaceHistory()
          const validationResults = await Promise.all(
            recentWorkspacePaths.map((path) =>
              fileSystemRepository.isExistingDirectory(path)
            )
          )
          const nextRecentWorkspacePaths = recentWorkspacePaths.filter(
            (_, index) => validationResults[index]
          )

          if (
            !areStringArraysEqual(
              recentWorkspacePaths,
              nextRecentWorkspacePaths
            )
          ) {
            writeWorkspaceHistory(nextRecentWorkspacePaths)
          }

          const workspacePath = nextRecentWorkspacePaths[0] ?? null

          set(
            buildWorkspaceState({
              workspacePath,
              recentWorkspacePaths: nextRecentWorkspacePaths,
              isTreeLoading: Boolean(workspacePath),
            })
          )
          useCollectionStore.getState().resetCollectionPath()

          if (workspacePath) {
            await bootstrapWorkspace(workspacePath, {
              restoreLastOpenedNote: true,
            })
          } else {
            set({ isMigrationsComplete: true })
          }
        } catch (error) {
          console.error('Failed to initialize workspace:', error)
          set(buildWorkspaceState())
          useCollectionStore.getState().resetCollectionPath()
        }
      },

      setWorkspace: async (path: string) => {
        try {
          if (!(await fileSystemRepository.isExistingDirectory(path))) {
            const updatedHistory = removeFromWorkspaceHistory(path)
            set({ recentWorkspacePaths: updatedHistory })
            toast.error('Folder does not exist.', {
              description: path,
              position: 'bottom-left',
            })
            return
          }

          const { tab, closeTab, clearHistory } = useTabStore.getState()

          if (tab) {
            closeTab(tab.path)
          }

          clearHistory()

          const recentWorkspacePaths = get().recentWorkspacePaths

          const updatedHistory = [
            path,
            ...recentWorkspacePaths.filter((entry) => entry !== path),
          ].slice(0, MAX_HISTORY_LENGTH)

          writeWorkspaceHistory(updatedHistory)

          set(
            buildWorkspaceState({
              workspacePath: path,
              recentWorkspacePaths: updatedHistory,
              isTreeLoading: true,
            })
          )
          useCollectionStore.getState().resetCollectionPath()

          await bootstrapWorkspace(path)
        } catch (error) {
          console.error('Failed to set workspace:', error)
        }
      },

      openFolderPicker: async () => {
        const path = await open({
          multiple: false,
          directory: true,
          title: 'Select a folder',
        })

        if (path) {
          await get().setWorkspace(path)
        }
      },

      refreshWorkspaceEntries: async () => {
        const workspacePath = get().workspacePath

        if (!workspacePath) throw new Error('Workspace path is not set')

        set({ isTreeLoading: true })

        try {
          const entries = await buildWorkspaceEntries(
            workspacePath,
            fileSystemRepository
          )

          if (get().workspacePath !== workspacePath) {
            return
          }

          const prevPinned = get().pinnedDirectories
          const nextPinned = filterPinsWithEntries(
            filterPinsForWorkspace(prevPinned, workspacePath),
            entries,
            workspacePath
          )
          const pinsChanged = !areStringArraysEqual(prevPinned, nextPinned)

          const syncedExpanded = syncExpandedDirectoriesWithEntries(
            get().expandedDirectories,
            entries
          )
          const nextExpanded = syncedExpanded

          set({
            entries,
            isTreeLoading: false,
            expandedDirectories: syncedExpanded,
            ...(pinsChanged ? { pinnedDirectories: nextPinned } : {}),
          })

          await persistExpandedDirectories(workspacePath, nextExpanded)

          if (pinsChanged) {
            await persistPinnedDirectories(workspacePath, nextPinned)
          }
        } catch (e) {
          set({ isTreeLoading: false })
          throw e
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
          path === workspacePath ||
          !!findEntryByPath(get().entries, path)?.isDirectory
        if (!isDirectory) {
          return
        }

        const prevPinned = get().pinnedDirectories
        const nextPinned = normalizePinnedDirectoriesList([...prevPinned, path])

        if (nextPinned.length === prevPinned.length) {
          return
        }
        set({ pinnedDirectories: nextPinned })
        await persistPinnedDirectories(workspacePath, nextPinned)
      },

      unpinDirectory: async (path: string) => {
        const workspacePath = get().workspacePath
        if (!workspacePath) return

        const normalizedPath = normalizePathSeparators(path)
        const prevPinned = get().pinnedDirectories
        const nextPinned = normalizePinnedDirectoriesList(
          prevPinned.filter(
            (entry) => normalizePathSeparators(entry) !== normalizedPath
          )
        )
        if (nextPinned.length === prevPinned.length) {
          return
        }
        set({ pinnedDirectories: nextPinned })
        await persistPinnedDirectories(workspacePath, nextPinned)
      },

      toggleDirectory: async (path: string) => {
        const { workspacePath, expandedDirectories } = get()
        if (!workspacePath) throw new Error('Workspace path is not set')

        const updatedExpanded = toggleExpandedDirectory(
          expandedDirectories,
          path
        )
        set({ expandedDirectories: updatedExpanded })

        await persistExpandedDirectories(workspacePath, updatedExpanded)
      },

      createFolder: async (directoryPath: string, folderName: string) => {
        const workspacePath = get().workspacePath

        if (!workspacePath) {
          return null
        }

        // Remove path separators to prevent directory traversal
        const trimmedName = folderName.trim().replace(/[/\\]/g, '')
        if (!trimmedName) {
          return null
        }

        try {
          const { fileName: finalFolderName, fullPath: folderPath } =
            await generateUniqueFileName(
              trimmedName,
              directoryPath,
              fileSystemRepository.exists,
              {
                pattern: 'space',
              }
            )

          await fileSystemRepository.mkdir(folderPath, {
            recursive: true,
          })
          get().recordFsOperation()

          const newFolderEntry: WorkspaceEntry = {
            path: folderPath,
            name: finalFolderName,
            isDirectory: true,
            children: [],
            createdAt: undefined,
            modifiedAt: undefined,
          }

          const { entries, expandedDirectories } = get()

          const updatedEntries =
            directoryPath === workspacePath
              ? sortWorkspaceEntries([...entries, newFolderEntry])
              : addEntryToState(entries, directoryPath, newFolderEntry)

          const updatedExpanded = addExpandedDirectories(expandedDirectories, [
            directoryPath,
            folderPath,
          ])
          set({ entries: updatedEntries, expandedDirectories: updatedExpanded })

          await persistExpandedDirectories(
            workspacePath,
            updatedExpanded
          ).catch((error) => {
            console.error('Failed to persist expanded directories:', error)
          })

          useCollectionStore.getState().setCurrentCollectionPath(folderPath)

          const { setSelectedEntryPaths, setSelectionAnchorPath } =
            useFileExplorerSelectionStore.getState()
          setSelectedEntryPaths(new Set([folderPath]))
          setSelectionAnchorPath(folderPath)

          return folderPath
        } catch (error) {
          console.error('Failed to create folder with name:', error)
          return null
        }
      },

      createNote: async (
        directoryPath: string,
        options?: { initialName?: string; initialContent?: string }
      ) => {
        const workspacePath = get().workspacePath

        if (!workspacePath) {
          throw new Error('Workspace path is not set')
        }

        const baseName = `${options?.initialName ?? 'Untitled'}.md`
        const { fileName, fullPath: filePath } = await generateUniqueFileName(
          baseName,
          directoryPath,
          fileSystemRepository.exists,
          { pattern: 'space' }
        )

        await fileSystemRepository.writeTextFile(
          filePath,
          options?.initialContent ?? ''
        )
        get().recordFsOperation()

        const now = new Date()

        const newFileEntry: WorkspaceEntry = {
          path: filePath,
          name: fileName,
          isDirectory: false,
          children: undefined,
          createdAt: now,
          modifiedAt: now,
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
      },

      createAndOpenNote: async () => {
        const workspacePath = get().workspacePath

        if (!workspacePath) {
          return
        }

        const { tab, openTab } = useTabStore.getState()
        const { currentCollectionPath } = useCollectionStore.getState()
        let targetDirectory = workspacePath

        // Priority: currentCollectionPath > tab directory > workspace root
        if (currentCollectionPath) {
          targetDirectory = currentCollectionPath
        } else if (tab) {
          targetDirectory = await dirname(tab.path)
        }

        const newNotePath = await get().createNote(targetDirectory)
        await openTab(newNotePath)
      },

      deleteEntries: async (paths: string[]) => {
        let tabState = useTabStore.getState()
        const activeTabPath = tabState.tab?.path

        if (activeTabPath && paths.includes(activeTabPath)) {
          tabState = await waitForUnsavedTabToSettle(activeTabPath, () =>
            useTabStore.getState()
          )
          tabState.closeTab(activeTabPath)
        }

        if (paths.length === 1) {
          await fileSystemRepository.moveToTrash(paths[0])
        } else {
          await fileSystemRepository.moveManyToTrash(paths)
        }
        get().recordFsOperation()

        // Remove deleted paths from history
        for (const path of paths) {
          tabState.removePathFromHistory(path)
        }

        // Update currentCollectionPath and lastCollectionPath if they're being deleted
        const {
          currentCollectionPath,
          lastCollectionPath,
          setCurrentCollectionPath,
        } = useCollectionStore.getState()
        const shouldClearCurrentCollectionPath =
          currentCollectionPath && paths.includes(currentCollectionPath)
        const shouldClearLastCollectionPath =
          lastCollectionPath && paths.includes(lastCollectionPath)

        if (shouldClearCurrentCollectionPath || shouldClearLastCollectionPath) {
          if (shouldClearCurrentCollectionPath) {
            setCurrentCollectionPath(null)
          }
          if (shouldClearLastCollectionPath) {
            useCollectionStore.setState({ lastCollectionPath: null })
          }
        }

        // Remove deleted entries from state without full refresh
        const {
          workspacePath,
          pinnedDirectories,
          expandedDirectories,
          entries,
        } = get()
        if (!workspacePath) throw new Error('Workspace path is not set')

        const filteredPins = removePinsForPaths(pinnedDirectories, paths)
        const pinsChanged = filteredPins.length !== pinnedDirectories.length

        const updatedExpanded = removeExpandedDirectories(
          expandedDirectories,
          paths
        )
        set({
          entries: removeEntriesFromState(entries, paths),
          expandedDirectories: updatedExpanded,
          ...(pinsChanged ? { pinnedDirectories: filteredPins } : {}),
        })

        await persistExpandedDirectories(workspacePath, updatedExpanded)

        if (pinsChanged) {
          await persistPinnedDirectories(workspacePath, filteredPins)
        }
      },

      deleteEntry: async (path: string) => {
        await get().deleteEntries([path])
      },

      renameNoteWithAI: async (entry) => {
        const renameConfig = useAISettingsStore.getState().renameConfig

        if (!renameConfig) {
          return
        }

        if (entry.isDirectory || !entry.path.endsWith('.md')) {
          return
        }

        const [dirPath, rawContent] = await Promise.all([
          dirname(entry.path),
          fileSystemRepository.readTextFile(entry.path),
        ])

        const dirEntries = await fileSystemRepository.readDir(dirPath)
        const otherNoteNames = collectSiblingNoteNames(dirEntries, entry.name)

        const model = createModelFromConfig(renameConfig)
        const aiResponse = await generateText({
          model,
          system: AI_RENAME_SYSTEM_PROMPT,
          temperature: 0.3,
          prompt: buildRenamePrompt({
            currentName: entry.name,
            otherNoteNames,
            content: rawContent,
            dirPath,
          }),
        })

        const suggestedBaseName = extractAndSanitizeName(aiResponse.text)
        if (!suggestedBaseName) {
          throw new Error('The AI did not return a usable name.')
        }

        const { fileName: finalFileName } = await generateUniqueFileName(
          `${suggestedBaseName}.md`,
          dirPath,
          fileSystemRepository.exists
        )

        const renamedPath = await get().renameEntry(entry, finalFileName)

        const { tab, openTab } = useTabStore.getState()

        toast.success(`Renamed note to “${finalFileName}”`, {
          position: 'bottom-left',
          action:
            tab?.path === renamedPath
              ? undefined
              : {
                  label: 'Open',
                  onClick: () => {
                    openTab(renamedPath)
                  },
                },
        })
      },

      renameEntry: async (entry, newName) => {
        // Remove path separators to prevent directory traversal
        const trimmedName = newName.trim().replace(/[/\\]/g, '')

        if (!trimmedName || trimmedName === entry.name) {
          return entry.path
        }

        const tabState = await waitForUnsavedTabToSettle(entry.path, () =>
          useTabStore.getState()
        )

        const directoryPath = await dirname(entry.path)
        const nextPath = await join(directoryPath, trimmedName)

        if (nextPath === entry.path) {
          return entry.path
        }

        if (await fileSystemRepository.exists(nextPath)) {
          return entry.path
        }

        await fileSystemRepository.rename(entry.path, nextPath)
        get().recordFsOperation()

        await tabState.renameTab(entry.path, nextPath)
        tabState.updateHistoryPath(entry.path, nextPath)

        const {
          workspacePath,
          pinnedDirectories,
          expandedDirectories,
          entries,
        } = get()

        if (!workspacePath) throw new Error('Workspace path is not set')

        let nextPinned: string[] | null = null

        const updatedPins = entry.isDirectory
          ? renamePinnedDirectories(pinnedDirectories, entry.path, nextPath)
          : pinnedDirectories
        const pinsChanged =
          updatedPins.length !== pinnedDirectories.length ||
          updatedPins.some((path, index) => path !== pinnedDirectories[index])

        if (pinsChanged) {
          nextPinned = updatedPins
        }

        const updatedExpanded = entry.isDirectory
          ? renameExpandedDirectories(expandedDirectories, entry.path, nextPath)
          : expandedDirectories

        set({
          entries: updateEntryInState(
            entries,
            entry.path,
            nextPath,
            trimmedName
          ),
          expandedDirectories: updatedExpanded,
          ...(pinsChanged ? { pinnedDirectories: updatedPins } : {}),
        })

        // Update currentCollectionPath if the renamed entry is a directory and matches the current collection path
        if (entry.isDirectory) {
          const { currentCollectionPath, setCurrentCollectionPath } =
            useCollectionStore.getState()
          if (currentCollectionPath === entry.path) {
            setCurrentCollectionPath(nextPath)
          }
        }

        await persistExpandedDirectories(workspacePath, updatedExpanded)

        if (nextPinned) {
          await persistPinnedDirectories(workspacePath, nextPinned)
        }

        return nextPath
      },

      moveEntry: async (sourcePath: string, destinationPath: string) => {
        const workspacePath = get().workspacePath

        if (!workspacePath) throw new Error('Workspace path is not set')

        if (sourcePath === destinationPath) {
          return false
        }

        // Check if destination is a child of source (prevent parent moves into children)
        if (isPathEqualOrDescendant(destinationPath, sourcePath)) {
          return false
        }

        // Ensure both paths are within workspace
        const sourceInWorkspace = isPathEqualOrDescendant(
          sourcePath,
          workspacePath
        )
        const destinationInWorkspace = isPathEqualOrDescendant(
          destinationPath,
          workspacePath
        )

        if (!sourceInWorkspace || !destinationInWorkspace) {
          return false
        }

        try {
          const tabState = await waitForUnsavedTabToSettle(
            sourcePath,
            useTabStore.getState
          )

          // Find the entry to move before path operations to determine if it's a directory
          const entryToMove = findEntryByPath(get().entries, sourcePath)

          if (!entryToMove) {
            return false
          }

          const isDirectory = entryToMove.isDirectory

          const entryName = await basename(sourcePath)
          const newPath = await join(destinationPath, entryName)

          if (await fileSystemRepository.exists(newPath)) {
            return false
          }

          let markdownRewriteContext: {
            content: string
            sourceDir: string
          } | null = null
          let shouldRefreshTab = false

          if (entryName.endsWith('.md')) {
            try {
              const sourceDirectory = await dirname(sourcePath)
              if (sourceDirectory !== destinationPath) {
                const noteContent =
                  await fileSystemRepository.readTextFile(sourcePath)
                markdownRewriteContext = {
                  content: noteContent,
                  sourceDir: sourceDirectory,
                }
              }
            } catch (error) {
              console.error('Failed to prepare markdown link updates:', error)
            }
          }

          await fileSystemRepository.rename(sourcePath, newPath)
          get().recordFsOperation()

          if (markdownRewriteContext) {
            try {
              const updatedContent = rewriteMarkdownRelativeLinks(
                markdownRewriteContext.content,
                markdownRewriteContext.sourceDir,
                destinationPath
              )

              if (updatedContent !== markdownRewriteContext.content) {
                await fileSystemRepository.writeTextFile(
                  newPath,
                  updatedContent
                )
                shouldRefreshTab = true
              }
            } catch (error) {
              console.error(
                'Failed to rewrite markdown links after move:',
                error
              )
            }
          }

          // Update tab path if the moved file is currently open
          await tabState.renameTab(sourcePath, newPath, {
            refreshContent: shouldRefreshTab,
          })
          tabState.updateHistoryPath(sourcePath, newPath)

          const { currentCollectionPath } = useCollectionStore.getState()

          // Update currentCollectionPath if it's being moved
          const shouldUpdateCollectionPath =
            currentCollectionPath === sourcePath

          const { entries, expandedDirectories, pinnedDirectories } = get()

          let nextPinned: string[] | null = null
          let nextExpanded: string[] | null = null

          let updatedEntries: WorkspaceEntry[]

          if (destinationPath === workspacePath) {
            // Moving to workspace root - add directly to entries array
            // First, remove from source location
            const filteredEntries = removeEntryFromState(entries, sourcePath)

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
            // Moving to a subdirectory - use existing logic
            updatedEntries = moveEntryInState(
              entries,
              sourcePath,
              destinationPath
            )
          }

          const updatedExpanded = isDirectory
            ? renameExpandedDirectories(
                expandedDirectories,
                sourcePath,
                newPath
              )
            : expandedDirectories
          nextExpanded = updatedExpanded

          const updatedPinned = isDirectory
            ? renamePinnedDirectories(pinnedDirectories, sourcePath, newPath)
            : pinnedDirectories
          const pinsChanged =
            updatedPinned.length !== pinnedDirectories.length ||
            updatedPinned.some(
              (path, index) => path !== pinnedDirectories[index]
            )

          if (pinsChanged) {
            nextPinned = updatedPinned
          }

          set({
            entries: updatedEntries,
            expandedDirectories: updatedExpanded,
            ...(pinsChanged ? { pinnedDirectories: updatedPinned } : {}),
          })

          // Update currentCollectionPath if it's being moved
          if (shouldUpdateCollectionPath) {
            useCollectionStore.getState().setCurrentCollectionPath(newPath)
          }

          await persistExpandedDirectories(workspacePath, nextExpanded)

          if (nextPinned) {
            await persistPinnedDirectories(workspacePath, nextPinned)
          }

          return true
        } catch (error) {
          console.error(
            'Failed to move entry:',
            sourcePath,
            destinationPath,
            error
          )
          return false
        }
      },

      copyEntry: async (sourcePath: string, destinationPath: string) => {
        const workspacePath = get().workspacePath

        // Validation 1: Check if workspace is set
        if (!workspacePath) {
          return false
        }

        // Validation 2: Prevent copying to itself
        if (sourcePath === destinationPath) {
          return false
        }

        // Validation 3: Ensure destination is within workspace (source can be external)
        const destinationInWorkspace = isPathEqualOrDescendant(
          destinationPath,
          workspacePath
        )

        if (!destinationInWorkspace) {
          return false
        }

        // Get the file/folder name from source path
        const fileName = getFileNameFromPath(sourcePath)
        if (!fileName) {
          return false
        }

        // Construct the new path with auto-rename if needed
        const { fullPath: newPath } = await generateUniqueFileName(
          fileName,
          destinationPath,
          fileSystemRepository.exists,
          { pattern: 'parentheses' }
        )

        // Check if source is a directory
        const sourceStat = await fileSystemRepository.stat(sourcePath)
        const isDirectory = sourceStat.isDirectory

        await fileSystemRepository.copy(sourcePath, newPath)
        get().recordFsOperation()

        // Handle markdown link rewriting for markdown files
        if (fileName.endsWith('.md')) {
          const sourceDirectory = await dirname(sourcePath)
          if (sourceDirectory !== destinationPath) {
            const content = await fileSystemRepository.readTextFile(newPath)
            const updatedContent = rewriteMarkdownRelativeLinks(
              content,
              sourceDirectory,
              destinationPath
            )

            if (updatedContent !== content) {
              await fileSystemRepository.writeTextFile(newPath, updatedContent)
            }
          }
        }

        // Fetch file metadata
        const fileMetadata: { createdAt?: Date; modifiedAt?: Date } = {}
        const statResult = await fileSystemRepository.stat(newPath)
        if (statResult.birthtime) {
          fileMetadata.createdAt = new Date(statResult.birthtime)
        }
        if (statResult.mtime) {
          fileMetadata.modifiedAt = new Date(statResult.mtime)
        }

        // Update workspace entries state
        const newFileName = getFileNameFromPath(newPath) ?? fileName
        const newFileEntry: WorkspaceEntry = {
          path: newPath,
          name: newFileName,
          isDirectory,
          children: isDirectory ? [] : undefined,
          createdAt: fileMetadata.createdAt,
          modifiedAt: fileMetadata.modifiedAt,
        }

        set((state) => {
          const updatedEntries =
            destinationPath === workspacePath
              ? sortWorkspaceEntries([...state.entries, newFileEntry])
              : addEntryToState(state.entries, destinationPath, newFileEntry)

          return {
            entries: updatedEntries,
          }
        })

        if (isDirectory) {
          await get().refreshWorkspaceEntries()
          // Expand destination directory and the newly copied folder (if it's a directory)
          const expandedDirectories = get().expandedDirectories
          const nextExpanded = addExpandedDirectories(expandedDirectories, [
            destinationPath,
            newPath,
          ])
          set({
            expandedDirectories: nextExpanded,
          })
          persistExpandedDirectories(workspacePath, nextExpanded)
        }

        return true
      },

      moveExternalEntry: async (
        sourcePath: string,
        destinationPath: string
      ) => {
        const workspacePath = get().workspacePath

        // Validation 1: Check if workspace is set
        if (!workspacePath) {
          return false
        }

        // Get the file/folder name from source path
        const fileName = getFileNameFromPath(sourcePath)
        if (!fileName) {
          return false
        }

        // Construct the new path with auto-rename if needed
        const { fullPath: newPath } = await generateUniqueFileName(
          fileName,
          destinationPath,
          fileSystemRepository.exists,
          { pattern: 'parentheses' }
        )

        // Check if source is a directory
        const sourceStat = await fileSystemRepository.stat(sourcePath)
        const isDirectory = sourceStat.isDirectory

        // Move the file
        await fileSystemRepository.rename(sourcePath, newPath)
        get().recordFsOperation()

        // Fetch file metadata
        const fileMetadata: { createdAt?: Date; modifiedAt?: Date } = {}
        const statResult = await fileSystemRepository.stat(newPath)
        if (statResult.birthtime) {
          fileMetadata.createdAt = new Date(statResult.birthtime)
        }
        if (statResult.mtime) {
          fileMetadata.modifiedAt = new Date(statResult.mtime)
        }

        // Load directory children if it's a directory
        let directoryChildren: WorkspaceEntry[] | undefined
        if (isDirectory) {
          try {
            directoryChildren = await buildWorkspaceEntries(
              newPath,
              fileSystemRepository
            )
          } catch (error) {
            console.error(
              'Failed to load directory children after move:',
              error
            )
            directoryChildren = []
          }
        }

        // Update workspace entries state
        const newFileName = getFileNameFromPath(newPath) ?? fileName
        const newFileEntry: WorkspaceEntry = {
          path: newPath,
          name: newFileName,
          isDirectory,
          children: directoryChildren,
          createdAt: fileMetadata.createdAt,
          modifiedAt: fileMetadata.modifiedAt,
        }

        const { entries, expandedDirectories } = get()

        const updatedEntries =
          destinationPath === workspacePath
            ? sortWorkspaceEntries([...entries, newFileEntry])
            : addEntryToState(entries, destinationPath, newFileEntry)

        set({
          entries: updatedEntries,
        })

        if (isDirectory) {
          const updatedExpanded = addExpandedDirectories(expandedDirectories, [
            destinationPath,
            newPath,
          ])
          set({
            expandedDirectories: updatedExpanded,
          })
          await persistExpandedDirectories(workspacePath, updatedExpanded)
        }

        return true
      },

      updateEntryModifiedDate: async (path: string) => {
        try {
          const fileMetadata = await fileSystemRepository.stat(path)
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

      clearWorkspace: async () => {
        const { tab, closeTab, clearHistory } = useTabStore.getState()
        const workspacePath = get().workspacePath

        if (!workspacePath) return

        await fileSystemRepository.moveToTrash(workspacePath)

        if (tab) {
          closeTab(tab.path)
          clearHistory()
        }

        const recentWorkspacePaths = get().recentWorkspacePaths
        const updatedHistory = recentWorkspacePaths.filter(
          (path) => path !== workspacePath
        )

        writeWorkspaceHistory(updatedHistory)

        set(
          buildWorkspaceState({
            recentWorkspacePaths: updatedHistory,
            isMigrationsComplete: true,
          })
        )
        useCollectionStore.getState().resetCollectionPath()
      },
    }
  })

export const useWorkspaceStore = createWorkspaceStore({
  fileSystemRepository: new FileSystemRepository(),
})
