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
  writeTextFile,
} from '@tauri-apps/plugin-fs'
import { generateText } from 'ai'
import { ollama } from 'ollama-ai-provider-v2'
import { toast } from 'sonner'
import { create } from 'zustand'

import { type ChatConfig, useAISettingsStore } from './ai-settings-store'
import { useFileExplorerSelectionStore } from './file-explorer-selection-store'
import { useTabStore } from './tab-store'
import { useUIStore } from './ui-store'

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
  setExpandedDirectories: (
    action: (
      expandedDirectories: Record<string, boolean>
    ) => Record<string, boolean>
  ) => void
  initializeWorkspace: () => void
  setWorkspace: (path: string) => void
  openFolderPicker: () => Promise<void>
  refreshWorkspaceEntries: () => Promise<void>
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
}

const WORKSPACE_HISTORY_KEY = 'workspace-history'

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  isLoading: true,
  workspacePath: null,
  recentWorkspacePaths: [],
  isTreeLoading: false,
  entries: [],
  expandedDirectories: {},

  setExpandedDirectories: (action) => {
    set((state) => ({ expandedDirectories: action(state.expandedDirectories) }))
  },

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
      const { tab, closeTab } = useTabStore.getState()

      if (tab) {
        closeTab(tab.path)
      }

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

      await get().refreshWorkspaceEntries()
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
      const { isFileExplorerOpen, setFileExplorerOpen } = useUIStore.getState()
      if (!isFileExplorerOpen) {
        setFileExplorerOpen(true)
      }

      const { tab, openTab } = useTabStore.getState()
      let targetDirectory = workspacePath

      if (tab) {
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
      const { tab, isSaved, closeTab, removePathFromHistory } =
        useTabStore.getState()

      if (tab?.path && paths.includes(tab.path)) {
        closeTab(tab.path)

        if (!isSaved) {
          await new Promise((resolve) => setTimeout(resolve, 400))
        }
      }

      if (paths.length === 1) {
        await invoke('move_to_trash', { path: paths[0] })
      } else {
        await invoke('move_many_to_trash', { paths })
      }

      // Remove deleted paths from history
      for (const path of paths) {
        removePathFromHistory(path)
      }

      await get().refreshWorkspaceEntries()

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

      const { renameTab, updateHistoryPath } = useTabStore.getState()
      renameTab(entry.path, nextPath)
      updateHistoryPath(entry.path, nextPath)

      await get().refreshWorkspaceEntries()

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

      await rename(sourcePath, newPath)

      // Update tab path if the moved file is currently open
      const { renameTab, updateHistoryPath } = useTabStore.getState()
      renameTab(sourcePath, newPath)
      updateHistoryPath(sourcePath, newPath)

      await get().refreshWorkspaceEntries()
      return true
    } catch (error) {
      console.error('Failed to move entry:', sourcePath, destinationPath, error)
      return false
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
