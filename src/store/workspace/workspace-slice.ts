import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { resolve } from 'pathe'
import { toast } from 'sonner'
import type { StateCreator } from 'zustand'
import type { WorkspaceSettings } from '@/lib/settings-utils'
import { FileSystemRepository } from '@/repositories/file-system-repository'
import { WorkspaceHistoryRepository } from '@/repositories/workspace-history-repository'
import { WorkspaceSettingsRepository } from '@/repositories/workspace-settings-repository'
import { areStringArraysEqual } from '@/utils/array-utils'
import {
  isPathEqualOrDescendant,
  normalizePathSeparators,
} from '@/utils/path-utils'
import type { CollectionSlice } from '../collection/collection-slice'
import type { TabSlice } from '../tab/tab-slice'
import { buildWorkspaceEntries, findEntryByPath } from './utils/entry-utils'
import {
  syncExpandedDirectoriesWithEntries,
  toggleExpandedDirectory,
} from './utils/expanded-directories-utils'
import {
  filterPinsForWorkspace,
  filterPinsWithEntries,
  normalizePinnedDirectoriesList,
} from './utils/pinned-directories-utils'

const MAX_HISTORY_LENGTH = 5

type OpenDialog = (options: {
  multiple?: boolean
  directory?: boolean
  title?: string
}) => Promise<string | null>

type ApplyWorkspaceMigrations = (workspacePath: string) => Promise<void>

type WorkspaceSliceDependencies = {
  fileSystemRepository: FileSystemRepository
  settingsRepository: WorkspaceSettingsRepository
  historyRepository: WorkspaceHistoryRepository
  openDialog: OpenDialog
  applyWorkspaceMigrations: ApplyWorkspaceMigrations
}

const buildWorkspaceState = (overrides?: Partial<WorkspaceSlice>) => ({
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

export type WorkspaceSlice = {
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
    entriesOrAction:
      | WorkspaceEntry[]
      | ((entries: WorkspaceEntry[]) => WorkspaceEntry[])
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

export const prepareWorkspaceSlice =
  ({
    openDialog,
    applyWorkspaceMigrations,
    fileSystemRepository,
    settingsRepository,
    historyRepository,
  }: WorkspaceSliceDependencies): StateCreator<
    WorkspaceSlice & TabSlice & CollectionSlice,
    [],
    [],
    WorkspaceSlice
  > =>
  (set, get) => {
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
          get()
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

        get().updateEntries(entries)
        set({
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

      updateEntries: (entriesOrAction) => {
        const entries =
          typeof entriesOrAction === 'function'
            ? entriesOrAction(get().entries)
            : entriesOrAction
        set({ entries })
        get().refreshCollectionEntries()
      },

      applyWorkspaceUpdate: async (update) => {
        const { workspacePath, expandedDirectories, pinnedDirectories } = get()
        if (!workspacePath) throw new Error('Workspace path is not set')

        const shouldUpdate =
          update.entries ||
          update.expandedDirectories ||
          update.pinnedDirectories

        if (shouldUpdate) {
          if (update.entries) {
            get().updateEntries(update.entries)
          }
          set((state) => ({
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
          get().resetCollectionPath()

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
          get().resetCollectionPath()
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

          const { tab } = get()

          if (tab) {
            get().closeTab(tab.path)
          }

          get().clearHistory()

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
          get().resetCollectionPath()

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

          get().updateEntries(entries)
          set({
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
        const { tab } = get()
        const workspacePath = get().workspacePath

        if (!workspacePath) return

        await fileSystemRepository.moveToTrash(workspacePath)

        if (tab) {
          get().closeTab(tab.path)
          get().clearHistory()
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
        get().resetCollectionPath()
      },
    }
  }

export const createWorkspaceSlice = prepareWorkspaceSlice({
  fileSystemRepository: new FileSystemRepository(),
  settingsRepository: new WorkspaceSettingsRepository(),
  historyRepository: new WorkspaceHistoryRepository(),
  openDialog: async (options) => {
    const result = await open(options)
    return typeof result === 'string' ? result : null
  },
  applyWorkspaceMigrations: (workspacePath: string) =>
    invoke<void>('apply_workspace_migrations', { workspacePath }),
})
