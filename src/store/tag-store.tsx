import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'
import { loadSettings, saveSettings } from '@/lib/settings-utils'
import type { QuerySearchEntry } from '@/types/query-search-entry'
import type { WorkspaceEntry } from './workspace-store'

type TagStore = {
  tags: string[]
  currentWorkspacePath: string | null
  tagEntries: WorkspaceEntry[]
  currentTagPath: string | null
  currentRequestId: number
  isLoadingTagEntries: boolean
  tagCache: Record<string, WorkspaceEntry[]>
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
  removeTagEntries: (paths: string[]) => void
  updateTagEntry: (oldPath: string, newPath: string, newName: string) => void
  invalidateTagCache: () => void
}

const loadTagsFromFile = async (workspacePath: string): Promise<string[]> => {
  try {
    const settings = await loadSettings(workspacePath)
    return settings.tags || []
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
    await saveSettings(workspacePath, { tags })
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
  isLoadingTagEntries: false,
  tagCache: {},

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
      const state = get()
      set({
        tagEntries: [],
        currentTagPath: null,
        currentRequestId: state.currentRequestId + 1,
        isLoadingTagEntries: false,
      })
      return
    }

    const tagName = tagPath.slice(1).trim()
    if (!tagName || !workspacePath) {
      const state = get()
      set({
        tagEntries: [],
        currentTagPath: null,
        currentRequestId: state.currentRequestId + 1,
        isLoadingTagEntries: false,
      })
      return
    }

    if (!embeddingProvider || !embeddingModel) {
      const state = get()
      set({
        tagEntries: [],
        currentTagPath: null,
        currentRequestId: state.currentRequestId + 1,
        isLoadingTagEntries: false,
      })
      return
    }

    // Check cache first
    const cachedEntries = get().tagCache[tagName]

    if (cachedEntries) {
      // Use cached entries immediately
      set({
        currentTagPath: tagPath,
        tagEntries: cachedEntries,
        isLoadingTagEntries: false,
      })
      return
    }

    // Increment request ID to cancel previous requests
    const requestId = get().currentRequestId + 1
    set({
      currentRequestId: requestId,
      currentTagPath: tagPath,
      tagEntries: [],
      isLoadingTagEntries: true,
    })

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

      // Save to cache
      set((prevState) => ({
        tagEntries: result,
        isLoadingTagEntries: false,
        tagCache: {
          ...prevState.tagCache,
          [tagName]: result,
        },
      }))
    } catch (error) {
      // Check if this request is still current
      const currentState = get()
      if (currentState.currentRequestId !== requestId) {
        return
      }

      console.error('Failed to fetch query entries:', error)
      set({ tagEntries: [], isLoadingTagEntries: false })
    }
  },

  removeTagEntries: (paths: string[]) => {
    set((state) => ({
      tagEntries: state.tagEntries.filter(
        (entry) => !paths.includes(entry.path)
      ),
    }))
  },

  updateTagEntry: (oldPath: string, newPath: string, newName: string) => {
    set((state) => ({
      tagEntries: state.tagEntries.map((entry) =>
        entry.path === oldPath
          ? {
              ...entry,
              path: newPath,
              name: newName,
            }
          : entry
      ),
    }))
  },

  invalidateTagCache: () => {
    // Clear all tag cache entries since workspace change invalidates all caches
    set({ tagCache: {} })
  },
}))
