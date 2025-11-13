import { join } from '@tauri-apps/api/path'
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { create } from 'zustand'

const WORKSPACE_STATE_DIR = '.mdit'
const WORKSPACE_CONFIG_FILE = 'workspace.json'

type WorkspaceConfig = {
  tags: string[]
}

type TagStore = {
  tags: string[]
  currentWorkspacePath: string | null
  addTag: (tagName: string) => Promise<void>
  removeTag: (tagName: string) => Promise<void>
  loadTags: (workspacePath: string | null) => Promise<void>
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
}))
