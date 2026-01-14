import { generateText } from 'ai'
import { basename, dirname, join } from 'pathe'
import { toast } from 'sonner'
import type { StateCreator } from 'zustand'
import { FileSystemRepository } from '@/repositories/file-system-repository'
import {
  removeFileFrontmatterProperty,
  renameFileFrontmatterProperty,
  updateFileFrontmatter,
} from '@/utils/frontmatter-utils'
import {
  getFileNameFromPath,
  isPathEqualOrDescendant,
} from '@/utils/path-utils'
import { useAISettingsStore } from '../ai-settings-store'
import type { CollectionSlice } from '../collection/collection-slice'
import type { TabSlice } from '../tab/tab-slice'
import {
  AI_RENAME_SYSTEM_PROMPT,
  buildRenamePrompt,
  collectSiblingNoteNames,
  createModelFromConfig,
  extractAndSanitizeName,
} from './utils/ai-rename-utils'
import {
  addEntryToState,
  buildWorkspaceEntries,
  findEntryByPath,
  moveEntryInState,
  removeEntriesFromState,
  sortWorkspaceEntries,
  updateEntryInState,
  updateEntryMetadata,
} from './utils/entry-utils'
import {
  addExpandedDirectories,
  removeExpandedDirectories,
  renameExpandedDirectories,
} from './utils/expanded-directories-utils'
import { rewriteMarkdownRelativeLinks } from './utils/markdown-link-utils'
import {
  removePinsForPaths,
  renamePinnedDirectories,
} from './utils/pinned-directories-utils'
import { waitForUnsavedTabToSettle } from './utils/tab-save-utils'
import { generateUniqueFileName } from './utils/unique-filename-utils'
import type { WorkspaceFileSelectionSlice } from './workspace-file-selection-slice'
import type { WorkspaceEntry, WorkspaceSlice } from './workspace-slice'

export type GenerateText = (args: any) => Promise<{ text: string }>

export type FileSystemRepositoryLike = {
  exists: (path: string) => Promise<boolean>
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>
  readDir: (path: string) => Promise<{ name: string; isDirectory: boolean }[]>
  readTextFile: (path: string) => Promise<string>
  rename: (sourcePath: string, destinationPath: string) => Promise<void>
  writeTextFile: (path: string, contents: string) => Promise<void>
  moveToTrash: (path: string) => Promise<void>
  moveManyToTrash: (paths: string[]) => Promise<void>
  copy: (sourcePath: string, destinationPath: string) => Promise<void>
  stat: (path: string) => Promise<{
    isDirectory: boolean
    birthtime?: Date | number | null
    mtime?: Date | number | null
  }>
}

export type FrontmatterUtils = {
  updateFileFrontmatter: (
    path: string,
    updates: Record<string, unknown>
  ) => Promise<unknown>
  renameFileFrontmatterProperty: (
    path: string,
    oldKey: string,
    newKey: string
  ) => Promise<unknown>
  removeFileFrontmatterProperty: (path: string, key: string) => Promise<unknown>
}

export type ToastLike = {
  success: (...args: any[]) => any
  error?: (...args: any[]) => any
}

export type AiRenameUtils = {
  AI_RENAME_SYSTEM_PROMPT: string
  buildRenamePrompt: (args: {
    currentName: string
    otherNoteNames: string[]
    content: string
    dirPath: string
  }) => string
  collectSiblingNoteNames: (dirEntries: any[], entryName: string) => string[]
  createModelFromConfig: (config: any) => any
  extractAndSanitizeName: (raw: string) => string
}

export type WorkspaceFsStoreDependencies = {
  fileSystemRepository: FileSystemRepositoryLike
  generateText: GenerateText
  frontmatterUtils: FrontmatterUtils
  toast: ToastLike
  aiRenameUtils: AiRenameUtils
}

export type WorkspaceFsSlice = {
  lastFsOperationTime: number | null
  recordFsOperation: () => void
  saveNoteContent: (path: string, contents: string) => Promise<void>
  updateFrontmatter: (
    path: string,
    updates: Record<string, unknown>
  ) => Promise<void>
  renameFrontmatterProperty: (
    path: string,
    oldKey: string,
    newKey: string
  ) => Promise<void>
  removeFrontmatterProperty: (path: string, key: string) => Promise<void>
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

export const prepareWorkspaceFsSlice =
  ({
    fileSystemRepository,
    generateText,
    frontmatterUtils,
    toast,
    aiRenameUtils,
  }: WorkspaceFsStoreDependencies): StateCreator<
    WorkspaceFsSlice &
      WorkspaceSlice &
      WorkspaceFileSelectionSlice &
      CollectionSlice &
      TabSlice,
    [],
    [],
    WorkspaceFsSlice
  > =>
  (set, get) => {
    return {
      lastFsOperationTime: null,

      recordFsOperation: () => {
        set({ lastFsOperationTime: Date.now() })
      },

      saveNoteContent: async (path: string, contents: string) => {
        await fileSystemRepository.writeTextFile(path, contents)
        get().recordFsOperation()
      },

      updateFrontmatter: async (
        path: string,
        updates: Record<string, unknown>
      ) => {
        await frontmatterUtils.updateFileFrontmatter(path, updates)
        get().recordFsOperation()
        await get().updateEntryModifiedDate(path)
      },

      renameFrontmatterProperty: async (
        path: string,
        oldKey: string,
        newKey: string
      ) => {
        await frontmatterUtils.renameFileFrontmatterProperty(
          path,
          oldKey,
          newKey
        )
        get().recordFsOperation()
        await get().updateEntryModifiedDate(path)
      },

      removeFrontmatterProperty: async (path: string, key: string) => {
        await frontmatterUtils.removeFileFrontmatterProperty(path, key)
        get().recordFsOperation()
        await get().updateEntryModifiedDate(path)
      },

      createFolder: async (directoryPath: string, folderName: string) => {
        const { workspacePath, entries, expandedDirectories } = get()

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
          await get().applyWorkspaceUpdate({
            entries: updatedEntries,
            expandedDirectories: updatedExpanded,
          })

          get().setCurrentCollectionPath(folderPath)
          get().setSelectedEntryPaths(new Set([folderPath]))
          get().setSelectionAnchorPath(folderPath)

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
        const { workspacePath } = get()

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

        get().updateEntries((entries) =>
          directoryPath === workspacePath
            ? sortWorkspaceEntries([...entries, newFileEntry])
            : addEntryToState(entries, directoryPath, newFileEntry)
        )

        get().setSelectedEntryPaths(new Set([filePath]))
        get().setSelectionAnchorPath(filePath)

        return filePath
      },

      createAndOpenNote: async () => {
        const { workspacePath } = get()

        if (!workspacePath) {
          return
        }

        const { tab } = get()
        const { currentCollectionPath } = get()
        let targetDirectory = workspacePath

        // Priority: currentCollectionPath > tab directory > workspace root
        if (currentCollectionPath) {
          targetDirectory = currentCollectionPath
        } else if (tab) {
          targetDirectory = dirname(tab.path)
        }

        const newNotePath = await get().createNote(targetDirectory)
        await get().openTab(newNotePath)
      },

      deleteEntries: async (paths: string[]) => {
        const { tab } = get()
        const activeTabPath = tab?.path

        if (activeTabPath && paths.includes(activeTabPath)) {
          await waitForUnsavedTabToSettle(activeTabPath, get)
          get().closeTab(activeTabPath)
        }

        if (paths.length === 1) {
          await fileSystemRepository.moveToTrash(paths[0])
        } else {
          await fileSystemRepository.moveManyToTrash(paths)
        }
        get().recordFsOperation()

        // Remove deleted paths from history
        for (const path of paths) {
          get().removePathFromHistory(path)
        }

        // Update currentCollectionPath and lastCollectionPath if they're being deleted
        const { currentCollectionPath, lastCollectionPath } = get()
        const shouldClearCurrentCollectionPath =
          currentCollectionPath && paths.includes(currentCollectionPath)
        const shouldClearLastCollectionPath =
          lastCollectionPath && paths.includes(lastCollectionPath)

        if (shouldClearCurrentCollectionPath || shouldClearLastCollectionPath) {
          if (shouldClearCurrentCollectionPath) {
            get().setCurrentCollectionPath(null)
          }
          if (shouldClearLastCollectionPath) {
            get().clearLastCollectionPath()
          }
        }

        // Remove deleted entries from state without full refresh
        const { pinnedDirectories, expandedDirectories, entries } = get()

        const filteredPins = removePinsForPaths(pinnedDirectories, paths)
        const pinsChanged = filteredPins.length !== pinnedDirectories.length

        const updatedExpanded = removeExpandedDirectories(
          expandedDirectories,
          paths
        )
        await get().applyWorkspaceUpdate({
          entries: removeEntriesFromState(entries, paths),
          expandedDirectories: updatedExpanded,
          ...(pinsChanged ? { pinnedDirectories: filteredPins } : {}),
        })
      },

      deleteEntry: async (path: string) => {
        await get().deleteEntries([path])
      },

      renameNoteWithAI: async (entry) => {
        // TODO
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
        const otherNoteNames = aiRenameUtils.collectSiblingNoteNames(
          dirEntries,
          entry.name
        )

        const model = aiRenameUtils.createModelFromConfig(renameConfig)
        const aiResponse = await generateText({
          model,
          system: aiRenameUtils.AI_RENAME_SYSTEM_PROMPT,
          temperature: 0.3,
          prompt: aiRenameUtils.buildRenamePrompt({
            currentName: entry.name,
            otherNoteNames,
            content: rawContent,
            dirPath,
          }),
        })

        const suggestedBaseName = aiRenameUtils.extractAndSanitizeName(
          aiResponse.text
        )
        if (!suggestedBaseName) {
          throw new Error('The AI did not return a usable name.')
        }

        const { fileName: finalFileName } = await generateUniqueFileName(
          `${suggestedBaseName}.md`,
          dirPath,
          fileSystemRepository.exists
        )

        const renamedPath = await get().renameEntry(entry, finalFileName)

        const { tab } = get()

        toast.success(`Renamed note to "${finalFileName}"`, {
          position: 'bottom-left',
          action:
            tab?.path === renamedPath
              ? undefined
              : {
                  label: 'Open',
                  onClick: () => {
                    get().openTab(renamedPath)
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

        await waitForUnsavedTabToSettle(entry.path, get)

        const directoryPath = dirname(entry.path)
        const nextPath = join(directoryPath, trimmedName)

        if (nextPath === entry.path) {
          return entry.path
        }

        if (await fileSystemRepository.exists(nextPath)) {
          return entry.path
        }

        await fileSystemRepository.rename(entry.path, nextPath)
        get().recordFsOperation()

        await get().renameTab(entry.path, nextPath)
        get().updateHistoryPath(entry.path, nextPath)

        const {
          workspacePath,
          pinnedDirectories,
          expandedDirectories,
          entries,
        } = get()

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

        await get().applyWorkspaceUpdate({
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
          const { currentCollectionPath } = get()
          if (currentCollectionPath === entry.path) {
            get().setCurrentCollectionPath(nextPath)
          }
        }

        return nextPath
      },

      moveEntry: async (sourcePath: string, destinationPath: string) => {
        const { workspacePath } = get()

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
          await waitForUnsavedTabToSettle(sourcePath, get)

          // Find the entry to move before path operations to determine if it's a directory
          const entryToMove = findEntryByPath(get().entries, sourcePath)

          if (!entryToMove) {
            return false
          }

          const isDirectory = entryToMove.isDirectory

          const entryName = basename(sourcePath)
          const newPath = join(destinationPath, entryName)

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
              const sourceDirectory = dirname(sourcePath)
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
          await get().renameTab(sourcePath, newPath, {
            refreshContent: shouldRefreshTab,
          })
          get().updateHistoryPath(sourcePath, newPath)

          const { currentCollectionPath } = get()

          // Update currentCollectionPath if it's being moved
          const shouldUpdateCollectionPath =
            currentCollectionPath === sourcePath

          const { entries, expandedDirectories, pinnedDirectories } = get()

          // Use unified moveEntryInState for both root and subdirectory moves
          const updatedEntries = moveEntryInState(
            entries,
            sourcePath,
            destinationPath,
            workspacePath
          )

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

          await get().applyWorkspaceUpdate({
            entries: updatedEntries,
            expandedDirectories: updatedExpanded,
            ...(pinsChanged ? { pinnedDirectories: updatedPinned } : {}),
          })

          // Update currentCollectionPath if it's being moved
          if (shouldUpdateCollectionPath) {
            get().setCurrentCollectionPath(newPath)
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
        const { workspacePath } = get()

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
          const sourceDirectory = dirname(sourcePath)
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

        // Load directory children if it's a directory
        let directoryChildren: WorkspaceEntry[] | undefined
        if (isDirectory) {
          try {
            directoryChildren = await buildWorkspaceEntries(
              newPath,
              fileSystemRepository as any
            )
          } catch (error) {
            console.error(
              'Failed to load directory children after copy:',
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

        if (!isDirectory) {
          get().updateEntries((entries) =>
            destinationPath === workspacePath
              ? sortWorkspaceEntries([...entries, newFileEntry])
              : addEntryToState(entries, destinationPath, newFileEntry)
          )
        }

        if (isDirectory) {
          const { entries, expandedDirectories } = get()
          const updatedEntries =
            destinationPath === workspacePath
              ? sortWorkspaceEntries([...entries, newFileEntry])
              : addEntryToState(entries, destinationPath, newFileEntry)

          const updatedExpanded = addExpandedDirectories(expandedDirectories, [
            destinationPath,
            newPath,
          ])

          await get().applyWorkspaceUpdate({
            entries: updatedEntries,
            expandedDirectories: updatedExpanded,
          })
        }

        return true
      },

      moveExternalEntry: async (
        sourcePath: string,
        destinationPath: string
      ) => {
        const { workspacePath } = get()

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
              fileSystemRepository as any
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

        const updatedExpanded = isDirectory
          ? addExpandedDirectories(expandedDirectories, [
              destinationPath,
              newPath,
            ])
          : undefined

        await get().applyWorkspaceUpdate({
          entries: updatedEntries,
          ...(updatedExpanded && { expandedDirectories: updatedExpanded }),
        })

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

          get().updateEntries((entries) =>
            updateEntryMetadata(entries, path, metadata)
          )
        } catch (error) {
          // Silently fail if metadata cannot be retrieved
          console.debug('Failed to update entry modified date:', path, error)
        }
      },
    }
  }

const frontmatterUtils: FrontmatterUtils = {
  updateFileFrontmatter,
  renameFileFrontmatterProperty,
  removeFileFrontmatterProperty,
}

const aiRenameUtils: AiRenameUtils = {
  AI_RENAME_SYSTEM_PROMPT,
  buildRenamePrompt,
  collectSiblingNoteNames,
  createModelFromConfig,
  extractAndSanitizeName,
}

export const createWorkspaceFsSlice = prepareWorkspaceFsSlice({
  fileSystemRepository: new FileSystemRepository(),
  generateText,
  frontmatterUtils,
  toast,
  aiRenameUtils,
})
