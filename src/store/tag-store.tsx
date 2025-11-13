import { invoke } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { create } from 'zustand'
import type { WorkspaceEntry } from './workspace-store'

const WORKSPACE_STATE_DIR = '.mdit'
const WORKSPACE_CONFIG_FILE = 'workspace.json'

type WorkspaceConfig = {
  tags: string[]
}

type QuerySearchEntry = {
  path: string
  name: string
  createdAt?: number
  modifiedAt?: number
  similarity: number
}

type TagStore = {
  tags: string[]
  currentWorkspacePath: string | null
  tagEntries: WorkspaceEntry[]
  currentTagPath: string | null
  currentRequestId: number
  addTag: (tagName: string) => Promise<void>
  removeTag: (tagName: string) => Promise<void>
  loadTags: (workspacePath: string | null) => Promise<void>
  fetchTagEntries: (
    workspacePath: string,
    tagName: string,
    embeddingProvider: string,
    embeddingModel: string
  ) => Promise<WorkspaceEntry[]>
  loadTagEntries: (
    tagPath: string | null,
    workspacePath: string | null,
    embeddingProvider: string,
    embeddingModel: string
  ) => Promise<void>
}

const getWorkspaceConfigPath = async (
  workspacePath: string
): Promise<string> => {
  const stateDir = await join(workspacePath, WORKSPACE_STATE_DIR)
  return await join(stateDir, WORKSPACE_CONFIG_FILE)
}

const loadTagsFromFile = async (workspacePath: string): Promise<string[]> => {
  try {
    const configPath = await getWorkspaceConfigPath(workspacePath)

    if (!(await exists(configPath))) {
      return []
    }

    const content = await readTextFile(configPath)
    const config: WorkspaceConfig = JSON.parse(content)

    return config.tags || []
  } catch (error) {
    console.error('Failed to load tags from file:', error)
    return []
  }
}

const saveTagsToFile = async (
  workspacePath: string,
  tags: string[]
): Promise<void> => {
  try {
    const configPath = await getWorkspaceConfigPath(workspacePath)

    const config: WorkspaceConfig = { tags }
    await writeTextFile(configPath, JSON.stringify(config, null, 2))
  } catch (error) {
    console.error('Failed to save tags to file:', error)
  }
}

export const useTagStore = create<TagStore>((set, get) => ({
  tags: [],
  currentWorkspacePath: null,
  tagEntries: [],
  currentTagPath: null,
  currentRequestId: 0,

  loadTags: async (workspacePath: string | null) => {
    if (!workspacePath) {
      set({ tags: [], currentWorkspacePath: null })
      return
    }

    const tags = await loadTagsFromFile(workspacePath)
    set({ tags, currentWorkspacePath: workspacePath })
  },

  addTag: async (tagName: string) => {
    const trimmedTagName = tagName.trim()
    if (!trimmedTagName) {
      return
    }

    const state = get()
    if (state.tags.includes(trimmedTagName)) {
      return
    }

    const newTags = [...state.tags, trimmedTagName]
    set({ tags: newTags })

    // Save to file immediately if workspace path is available
    if (state.currentWorkspacePath) {
      await saveTagsToFile(state.currentWorkspacePath, newTags)
    }
  },

  removeTag: async (tagName: string) => {
    const state = get()
    if (!state.tags.includes(tagName)) {
      return
    }

    const newTags = state.tags.filter((tag) => tag !== tagName)
    set({ tags: newTags })

    // Save to file immediately if workspace path is available
    if (state.currentWorkspacePath) {
      await saveTagsToFile(state.currentWorkspacePath, newTags)
    }
  },

  fetchTagEntries: async (
    workspacePath: string,
    tagName: string,
    embeddingProvider: string,
    embeddingModel: string
  ): Promise<WorkspaceEntry[]> => {
    try {
      const query = `Notes about ${tagName}`
      const result = await invoke<QuerySearchEntry[]>('search_query_entries', {
        workspacePath,
        query,
        embeddingProvider,
        embeddingModel,
      })

      const normalizedEntries = result.map<WorkspaceEntry>((entry) => ({
        path: entry.path,
        name: entry.name,
        isDirectory: false,
        createdAt:
          typeof entry.createdAt === 'number'
            ? new Date(entry.createdAt)
            : undefined,
        modifiedAt:
          typeof entry.modifiedAt === 'number'
            ? new Date(entry.modifiedAt)
            : undefined,
        tagSimilarity:
          typeof entry.similarity === 'number' ? entry.similarity : undefined,
      }))

      return normalizedEntries
    } catch (error) {
      console.error('Failed to fetch query entries:', error)
      return []
    }
  },

  loadTagEntries: async (
    tagPath: string | null,
    workspacePath: string | null,
    embeddingProvider: string,
    embeddingModel: string
  ): Promise<void> => {
    // If tag path is null or doesn't start with "#", clear entries
    if (!tagPath || !tagPath.startsWith('#')) {
      set({ tagEntries: [], currentTagPath: null })
      return
    }

    const tagName = tagPath.slice(1).trim()
    if (!tagName || !workspacePath) {
      set({ tagEntries: [], currentTagPath: null })
      return
    }

    if (!embeddingProvider || !embeddingModel) {
      set({ tagEntries: [], currentTagPath: null })
      return
    }

    // Increment request ID to cancel previous requests
    const state = get()
    const requestId = state.currentRequestId + 1
    set({ currentRequestId: requestId, currentTagPath: tagPath })

    try {
      const result = await get().fetchTagEntries(
        workspacePath,
        tagName,
        embeddingProvider,
        embeddingModel
      )

      // Check if this request is still current
      const currentState = get()
      if (currentState.currentRequestId !== requestId) {
        return
      }

      set({ tagEntries: result })
    } catch (error) {
      // Check if this request is still current
      const currentState = get()
      if (currentState.currentRequestId !== requestId) {
        return
      }

      console.error('Failed to fetch query entries:', error)
      set({ tagEntries: [] })
    }
  },
}))
