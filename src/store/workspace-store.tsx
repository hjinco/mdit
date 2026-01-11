import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { resolve } from 'pathe'
import { toast } from 'sonner'
import { create } from 'zustand'
import type { WorkspaceSettings } from '@/lib/settings-utils'
import { FileSystemRepository } from '@/repositories/file-system-repository'
import { WorkspaceHistoryRepository } from '@/repositories/workspace-history-repository'
import { WorkspaceSettingsRepository } from '@/repositories/workspace-settings-repository'
import { areStringArraysEqual } from '@/utils/array-utils'
import {
  isPathEqualOrDescendant,
  normalizePathSeparators,
} from '@/utils/path-utils'
import {
  buildWorkspaceEntries,
  findEntryByPath,
} from './workspace/utils/entry-utils'
import {
  syncExpandedDirectoriesWithEntries,
  toggleExpandedDirectory,
} from './workspace/utils/expanded-directories-utils'
import {
  filterPinsForWorkspace,
  filterPinsWithEntries,
  normalizePinnedDirectoriesList,
} from './workspace/utils/pinned-directories-utils'
import type {
  CollectionStoreAdapter,
  TabStoreAdapter,
} from './workspace-store-adapters'
import {
  collectionStoreAdapter,
  tabStoreAdapter,
} from './workspace-store-adapters'

const MAX_HISTORY_LENGTH = 5

type OpenDialog = (options: {
  multiple?: boolean
  directory?: boolean
  title?: string
}) => Promise<string | null>

type ApplyWorkspaceMigrations = (workspacePath: string) => Promise<void>

type WorkspaceStoreDependencies = {
  fileSystemRepository: FileSystemRepository
  settingsRepository: WorkspaceSettingsRepository
  historyRepository: WorkspaceHistoryRepository
  openDialog: OpenDialog
  applyWorkspaceMigrations: ApplyWorkspaceMigrations
  tabStoreAdapter: TabStoreAdapter
  collectionStoreAdapter: CollectionStoreAdapter
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
  setExpandedDirectories: (
    action: (expandedDirectories: string[]) => string[]
  ) => Promise<void>
  updateEntries: (
    action: (entries: WorkspaceEntry[]) => WorkspaceEntry[]
  ) => void
  applyWorkspaceUpdate: (update: {
    entries?: WorkspaceEntry[]
    expandedDirectories?: string[]
    pinnedDirectories?: string[]
  }) => Promise<void>
  initializeWorkspace: () => Promise<void>
  setWorkspace: (path: string) => Promise<void>
  openFolderPicker: () => Promise<void>
  refreshWorkspaceEntries: () => Promise<void>
  pinDirectory: (path: string) => Promise<void>
  unpinDirectory: (path: string) => Promise<void>
  toggleDirectory: (path: string) => Promise<void>
  clearWorkspace: () => Promise<void>
}

export const createWorkspaceStore = ({
  fileSystemRepository,
  settingsRepository,
  historyRepository,
  openDialog,
  applyWorkspaceMigrations,
  tabStoreAdapter,
  collectionStoreAdapter,
}: WorkspaceStoreDependencies) =>
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
          tabStoreAdapter.openTab(absolutePath).catch((error) => {
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
        await applyWorkspaceMigrations(workspacePath)
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
          settingsRepository.loadSettings(workspacePath),
          buildWorkspaceEntries(workspacePath, fileSystemRepository),
        ])

        if (get().workspacePath !== workspacePath) {
          return
        }

        const pinsFromSettings = filterPinsForWorkspace(
          settingsRepository.getPinnedDirectoriesFromSettings(
            workspacePath,
            settings
          ),
          workspacePath
        )
        const nextPinned = filterPinsWithEntries(
          pinsFromSettings,
          entries,
          workspacePath
        )
        const pinsChanged = !areStringArraysEqual(pinsFromSettings, nextPinned)
        const expandedFromSettings =
          settingsRepository.getExpandedDirectoriesFromSettings(
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
          await settingsRepository.persistPinnedDirectories(
            workspacePath,
            nextPinned
          )
        }

        const expandedChanged = !areStringArraysEqual(
          expandedFromSettings,
          syncedExpandedDirectories
        )

        if (expandedChanged) {
          settingsRepository.persistExpandedDirectories(
            workspacePath,
            syncedExpandedDirectories
          )
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

      setExpandedDirectories: async (action) => {
        const { workspacePath, expandedDirectories } = get()
        if (!workspacePath) throw new Error('Workspace path is not set')

        const previousExpanded = expandedDirectories
        const updatedExpanded = action(expandedDirectories)

        set({
          expandedDirectories: updatedExpanded,
        })

        if (!areStringArraysEqual(previousExpanded, updatedExpanded)) {
          await settingsRepository.persistExpandedDirectories(
            workspacePath,
            updatedExpanded
          )
        }
      },

      updateEntries: (action) => {
        set((state) => ({
          entries: action(state.entries),
        }))
      },

      applyWorkspaceUpdate: async (update) => {
        const { workspacePath, expandedDirectories, pinnedDirectories } = get()
        if (!workspacePath) throw new Error('Workspace path is not set')

        const shouldUpdate =
          update.entries ||
          update.expandedDirectories ||
          update.pinnedDirectories

        if (shouldUpdate) {
          set((state) => ({
            entries: update.entries ?? state.entries,
            expandedDirectories:
              update.expandedDirectories ?? state.expandedDirectories,
            pinnedDirectories:
              update.pinnedDirectories ?? state.pinnedDirectories,
          }))
        }

        if (
          update.expandedDirectories &&
          !areStringArraysEqual(expandedDirectories, update.expandedDirectories)
        ) {
          await settingsRepository.persistExpandedDirectories(
            workspacePath,
            update.expandedDirectories
          )
        }

        if (
          update.pinnedDirectories &&
          !areStringArraysEqual(pinnedDirectories, update.pinnedDirectories)
        ) {
          await settingsRepository.persistPinnedDirectories(
            workspacePath,
            update.pinnedDirectories
          )
        }
      },

      initializeWorkspace: async () => {
        try {
          const recentWorkspacePaths = historyRepository.readWorkspaceHistory()
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
            historyRepository.writeWorkspaceHistory(nextRecentWorkspacePaths)
          }

          const workspacePath = nextRecentWorkspacePaths[0] ?? null

          set(
            buildWorkspaceState({
              workspacePath,
              recentWorkspacePaths: nextRecentWorkspacePaths,
              isTreeLoading: Boolean(workspacePath),
            })
          )
          collectionStoreAdapter.resetCollectionPath()

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
          collectionStoreAdapter.resetCollectionPath()
        }
      },

      setWorkspace: async (path: string) => {
        try {
          if (!(await fileSystemRepository.isExistingDirectory(path))) {
            const updatedHistory =
              historyRepository.removeFromWorkspaceHistory(path)
            set({ recentWorkspacePaths: updatedHistory })
            toast.error('Folder does not exist.', {
              description: path,
              position: 'bottom-left',
            })
            return
          }

          const { tab } = tabStoreAdapter.getSnapshot()

          if (tab) {
            tabStoreAdapter.closeTab(tab.path)
          }

          tabStoreAdapter.clearHistory()

          const recentWorkspacePaths = get().recentWorkspacePaths

          const updatedHistory = [
            path,
            ...recentWorkspacePaths.filter((entry) => entry !== path),
          ].slice(0, MAX_HISTORY_LENGTH)

          historyRepository.writeWorkspaceHistory(updatedHistory)

          set(
            buildWorkspaceState({
              workspacePath: path,
              recentWorkspacePaths: updatedHistory,
              isTreeLoading: true,
            })
          )
          collectionStoreAdapter.resetCollectionPath()

          await bootstrapWorkspace(path)
        } catch (error) {
          console.error('Failed to set workspace:', error)
        }
      },

      openFolderPicker: async () => {
        const path = await openDialog({
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

          await settingsRepository.persistExpandedDirectories(
            workspacePath,
            nextExpanded
          )

          if (pinsChanged) {
            await settingsRepository.persistPinnedDirectories(
              workspacePath,
              nextPinned
            )
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
        await settingsRepository.persistPinnedDirectories(
          workspacePath,
          nextPinned
        )
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
        await settingsRepository.persistPinnedDirectories(
          workspacePath,
          nextPinned
        )
      },

      toggleDirectory: async (path: string) => {
        const { workspacePath, expandedDirectories } = get()
        if (!workspacePath) throw new Error('Workspace path is not set')

        const updatedExpanded = toggleExpandedDirectory(
          expandedDirectories,
          path
        )
        set({ expandedDirectories: updatedExpanded })

        await settingsRepository.persistExpandedDirectories(
          workspacePath,
          updatedExpanded
        )
      },

      clearWorkspace: async () => {
        const { tab } = tabStoreAdapter.getSnapshot()
        const workspacePath = get().workspacePath

        if (!workspacePath) return

        await fileSystemRepository.moveToTrash(workspacePath)

        if (tab) {
          tabStoreAdapter.closeTab(tab.path)
          tabStoreAdapter.clearHistory()
        }

        const recentWorkspacePaths = get().recentWorkspacePaths
        const updatedHistory = recentWorkspacePaths.filter(
          (path) => path !== workspacePath
        )

        historyRepository.writeWorkspaceHistory(updatedHistory)

        set(
          buildWorkspaceState({
            recentWorkspacePaths: updatedHistory,
            isMigrationsComplete: true,
          })
        )
        collectionStoreAdapter.resetCollectionPath()
      },
    }
  })

export const useWorkspaceStore = createWorkspaceStore({
  fileSystemRepository: new FileSystemRepository(),
  settingsRepository: new WorkspaceSettingsRepository(),
  historyRepository: new WorkspaceHistoryRepository(),
  openDialog: async (options) => {
    const result = await open(options)
    return typeof result === 'string' ? result : null
  },
  applyWorkspaceMigrations: (workspacePath: string) =>
    invoke<void>('apply_workspace_migrations', { workspacePath }),
  tabStoreAdapter,
  collectionStoreAdapter,
})
