import { basename, dirname, join } from '@tauri-apps/api/path'
import { generateText } from 'ai'
import { toast } from 'sonner'
import { create } from 'zustand'
import { FileSystemRepository } from '@/repositories/file-system-repository'
import {
  getFileNameFromPath,
  isPathEqualOrDescendant,
} from '@/utils/path-utils'
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
  removeExpandedDirectories,
  renameExpandedDirectories,
} from './workspace/utils/expanded-directories-utils'
import { rewriteMarkdownRelativeLinks } from './workspace/utils/markdown-link-utils'
import {
  removePinsForPaths,
  renamePinnedDirectories,
} from './workspace/utils/pinned-directories-utils'
import { waitForUnsavedTabToSettle } from './workspace/utils/tab-save-utils'
import { generateUniqueFileName } from './workspace/utils/unique-filename-utils'
import type { WorkspaceEntry } from './workspace-store'
import type { WorkspaceStoreAdapter } from './workspace-store-adapter'
import { workspaceStoreAdapter } from './workspace-store-adapter'
import type {
  AISettingsAdapter,
  CollectionStoreAdapter,
  FileExplorerSelectionAdapter,
  TabStoreAdapter,
} from './workspace-store-adapters'
import {
  aiSettingsAdapter,
  collectionStoreAdapter,
  fileExplorerSelectionAdapter,
  tabStoreAdapter,
} from './workspace-store-adapters'

type GenerateText = typeof generateText

type WorkspaceFsStoreDependencies = {
  fileSystemRepository: FileSystemRepository
  generateText: GenerateText
  tabStoreAdapter: TabStoreAdapter
  collectionStoreAdapter: CollectionStoreAdapter
  fileExplorerSelectionAdapter: FileExplorerSelectionAdapter
  aiSettingsAdapter: AISettingsAdapter
  workspaceStoreAdapter: WorkspaceStoreAdapter
}

type WorkspaceFsStore = {
  lastFsOperationTime: number | null
  recordFsOperation: () => void
  saveNoteContent: (path: string, contents: string) => Promise<void>
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
}

export const createWorkspaceFsStore = ({
  fileSystemRepository,
  generateText,
  tabStoreAdapter,
  collectionStoreAdapter,
  fileExplorerSelectionAdapter,
  aiSettingsAdapter,
  workspaceStoreAdapter,
}: WorkspaceFsStoreDependencies) =>
  create<WorkspaceFsStore>((set, get) => {
    const getWorkspaceSnapshot = () => workspaceStoreAdapter.getSnapshot()

    return {
      lastFsOperationTime: null,

      recordFsOperation: () => {
        set({ lastFsOperationTime: Date.now() })
      },

      saveNoteContent: async (path: string, contents: string) => {
        await fileSystemRepository.writeTextFile(path, contents)
        get().recordFsOperation()
      },

      createFolder: async (directoryPath: string, folderName: string) => {
        const { workspacePath, entries, expandedDirectories } =
          getWorkspaceSnapshot()

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

          const updatedEntries =
            directoryPath === workspacePath
              ? sortWorkspaceEntries([...entries, newFolderEntry])
              : addEntryToState(entries, directoryPath, newFolderEntry)

          const updatedExpanded = addExpandedDirectories(expandedDirectories, [
            directoryPath,
            folderPath,
          ])
          await workspaceStoreAdapter
            .applyWorkspaceUpdate({
              entries: updatedEntries,
              expandedDirectories: updatedExpanded,
            })
            .catch((error) => {
              console.error('Failed to persist expanded directories:', error)
            })

          collectionStoreAdapter.setCurrentCollectionPath(folderPath)
          fileExplorerSelectionAdapter.setSelectedEntryPaths(
            new Set([folderPath])
          )
          fileExplorerSelectionAdapter.setSelectionAnchorPath(folderPath)

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
        const { workspacePath } = getWorkspaceSnapshot()

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

        workspaceStoreAdapter.updateEntries((entries) =>
          directoryPath === workspacePath
            ? sortWorkspaceEntries([...entries, newFileEntry])
            : addEntryToState(entries, directoryPath, newFileEntry)
        )

        fileExplorerSelectionAdapter.setSelectedEntryPaths(new Set([filePath]))
        fileExplorerSelectionAdapter.setSelectionAnchorPath(filePath)

        return filePath
      },

      createAndOpenNote: async () => {
        const { workspacePath } = getWorkspaceSnapshot()

        if (!workspacePath) {
          return
        }

        const { tab } = tabStoreAdapter.getSnapshot()
        const { currentCollectionPath } = collectionStoreAdapter.getSnapshot()
        let targetDirectory = workspacePath

        // Priority: currentCollectionPath > tab directory > workspace root
        if (currentCollectionPath) {
          targetDirectory = currentCollectionPath
        } else if (tab) {
          targetDirectory = await dirname(tab.path)
        }

        const newNotePath = await get().createNote(targetDirectory)
        await tabStoreAdapter.openTab(newNotePath)
      },

      deleteEntries: async (paths: string[]) => {
        const { tab } = tabStoreAdapter.getSnapshot()
        const activeTabPath = tab?.path

        if (activeTabPath && paths.includes(activeTabPath)) {
          await waitForUnsavedTabToSettle(
            activeTabPath,
            tabStoreAdapter.getSnapshot
          )
          tabStoreAdapter.closeTab(activeTabPath)
        }

        if (paths.length === 1) {
          await fileSystemRepository.moveToTrash(paths[0])
        } else {
          await fileSystemRepository.moveManyToTrash(paths)
        }
        get().recordFsOperation()

        // Remove deleted paths from history
        for (const path of paths) {
          tabStoreAdapter.removePathFromHistory(path)
        }

        // Update currentCollectionPath and lastCollectionPath if they're being deleted
        const { currentCollectionPath, lastCollectionPath } =
          collectionStoreAdapter.getSnapshot()
        const shouldClearCurrentCollectionPath =
          currentCollectionPath && paths.includes(currentCollectionPath)
        const shouldClearLastCollectionPath =
          lastCollectionPath && paths.includes(lastCollectionPath)

        if (shouldClearCurrentCollectionPath || shouldClearLastCollectionPath) {
          if (shouldClearCurrentCollectionPath) {
            collectionStoreAdapter.setCurrentCollectionPath(null)
          }
          if (shouldClearLastCollectionPath) {
            collectionStoreAdapter.clearLastCollectionPath()
          }
        }

        // Remove deleted entries from state without full refresh
        const {
          workspacePath,
          pinnedDirectories,
          expandedDirectories,
          entries,
        } = getWorkspaceSnapshot()
        if (!workspacePath) throw new Error('Workspace path is not set')

        const filteredPins = removePinsForPaths(pinnedDirectories, paths)
        const pinsChanged = filteredPins.length !== pinnedDirectories.length

        const updatedExpanded = removeExpandedDirectories(
          expandedDirectories,
          paths
        )
        await workspaceStoreAdapter.applyWorkspaceUpdate({
          entries: removeEntriesFromState(entries, paths),
          expandedDirectories: updatedExpanded,
          ...(pinsChanged ? { pinnedDirectories: filteredPins } : {}),
        })
      },

      deleteEntry: async (path: string) => {
        await get().deleteEntries([path])
      },

      renameNoteWithAI: async (entry) => {
        const renameConfig = aiSettingsAdapter.getRenameConfig()

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

        const { tab } = tabStoreAdapter.getSnapshot()

        toast.success(`Renamed note to "${finalFileName}"`, {
          position: 'bottom-left',
          action:
            tab?.path === renamedPath
              ? undefined
              : {
                  label: 'Open',
                  onClick: () => {
                    tabStoreAdapter.openTab(renamedPath)
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

        await waitForUnsavedTabToSettle(entry.path, tabStoreAdapter.getSnapshot)

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

        await tabStoreAdapter.renameTab(entry.path, nextPath)
        tabStoreAdapter.updateHistoryPath(entry.path, nextPath)

        const {
          workspacePath,
          pinnedDirectories,
          expandedDirectories,
          entries,
        } = getWorkspaceSnapshot()

        if (!workspacePath) throw new Error('Workspace path is not set')

        const updatedPins = entry.isDirectory
          ? renamePinnedDirectories(pinnedDirectories, entry.path, nextPath)
          : pinnedDirectories
        const pinsChanged =
          updatedPins.length !== pinnedDirectories.length ||
          updatedPins.some((path, index) => path !== pinnedDirectories[index])

        const updatedExpanded = entry.isDirectory
          ? renameExpandedDirectories(expandedDirectories, entry.path, nextPath)
          : expandedDirectories

        await workspaceStoreAdapter.applyWorkspaceUpdate({
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
          const { currentCollectionPath } = collectionStoreAdapter.getSnapshot()
          if (currentCollectionPath === entry.path) {
            collectionStoreAdapter.setCurrentCollectionPath(nextPath)
          }
        }

        return nextPath
      },

      moveEntry: async (sourcePath: string, destinationPath: string) => {
        const { workspacePath } = getWorkspaceSnapshot()

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
          await waitForUnsavedTabToSettle(
            sourcePath,
            tabStoreAdapter.getSnapshot
          )

          // Find the entry to move before path operations to determine if it's a directory
          const entryToMove = findEntryByPath(
            getWorkspaceSnapshot().entries,
            sourcePath
          )

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
          await tabStoreAdapter.renameTab(sourcePath, newPath, {
            refreshContent: shouldRefreshTab,
          })
          tabStoreAdapter.updateHistoryPath(sourcePath, newPath)

          const { currentCollectionPath } = collectionStoreAdapter.getSnapshot()

          // Update currentCollectionPath if it's being moved
          const shouldUpdateCollectionPath =
            currentCollectionPath === sourcePath

          const { entries, expandedDirectories, pinnedDirectories } =
            getWorkspaceSnapshot()

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

          const updatedPinned = isDirectory
            ? renamePinnedDirectories(pinnedDirectories, sourcePath, newPath)
            : pinnedDirectories
          const pinsChanged =
            updatedPinned.length !== pinnedDirectories.length ||
            updatedPinned.some(
              (path, index) => path !== pinnedDirectories[index]
            )

          await workspaceStoreAdapter.applyWorkspaceUpdate({
            entries: updatedEntries,
            expandedDirectories: updatedExpanded,
            ...(pinsChanged ? { pinnedDirectories: updatedPinned } : {}),
          })

          // Update currentCollectionPath if it's being moved
          if (shouldUpdateCollectionPath) {
            collectionStoreAdapter.setCurrentCollectionPath(newPath)
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
        const { workspacePath } = getWorkspaceSnapshot()

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

        if (!isDirectory) {
          workspaceStoreAdapter.updateEntries((entries) =>
            destinationPath === workspacePath
              ? sortWorkspaceEntries([...entries, newFileEntry])
              : addEntryToState(entries, destinationPath, newFileEntry)
          )
        }

        if (isDirectory) {
          await workspaceStoreAdapter.refreshWorkspaceEntries()
          // Expand destination directory and the newly copied folder (if it's a directory)
          const { expandedDirectories } = getWorkspaceSnapshot()
          const nextExpanded = addExpandedDirectories(expandedDirectories, [
            destinationPath,
            newPath,
          ])
          await workspaceStoreAdapter.applyWorkspaceUpdate({
            expandedDirectories: nextExpanded,
          })
        }

        return true
      },

      moveExternalEntry: async (
        sourcePath: string,
        destinationPath: string
      ) => {
        const { workspacePath } = getWorkspaceSnapshot()

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

        const { entries, expandedDirectories } = getWorkspaceSnapshot()

        const updatedEntries =
          destinationPath === workspacePath
            ? sortWorkspaceEntries([...entries, newFileEntry])
            : addEntryToState(entries, destinationPath, newFileEntry)

        await workspaceStoreAdapter.applyWorkspaceUpdate({
          entries: updatedEntries,
        })

        if (isDirectory) {
          const updatedExpanded = addExpandedDirectories(expandedDirectories, [
            destinationPath,
            newPath,
          ])
          await workspaceStoreAdapter.applyWorkspaceUpdate({
            expandedDirectories: updatedExpanded,
          })
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

          workspaceStoreAdapter.updateEntries((entries) =>
            updateEntryMetadata(entries, path, metadata)
          )
        } catch (error) {
          // Silently fail if metadata cannot be retrieved
          console.debug('Failed to update entry modified date:', path, error)
        }
      },
    }
  })

export const useWorkspaceFsStore = createWorkspaceFsStore({
  fileSystemRepository: new FileSystemRepository(),
  generateText,
  tabStoreAdapter,
  collectionStoreAdapter,
  fileExplorerSelectionAdapter,
  aiSettingsAdapter,
  workspaceStoreAdapter,
})
