import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs'
import { join } from 'pathe'

const WORKSPACE_STATE_DIR = '.mdit'
const WORKSPACE_CONFIG_FILE = 'workspace.json'

export type WorkspaceSettings = {
  gitSync?: {
    branchName: string
    commitMessage: string
    autoSync: boolean
  }
  indexing?: {
    embeddingProvider: string
    embeddingModel: string
    autoIndex?: boolean
  }
  pinnedDirectories?: string[]
  lastOpenedNotePath?: string
  expandedDirectories?: string[]
}

const getWorkspaceConfigPath = (workspacePath: string): string => {
  return join(workspacePath, WORKSPACE_STATE_DIR, WORKSPACE_CONFIG_FILE)
}

export const loadSettings = async (
  workspacePath: string
): Promise<WorkspaceSettings> => {
  try {
    const configPath = getWorkspaceConfigPath(workspacePath)

    if (!(await exists(configPath))) {
      return {}
    }

    const content = await readTextFile(configPath)
    const config: WorkspaceSettings = JSON.parse(content)

    return config
  } catch (error) {
    console.error('Failed to load settings from file:', error)
    return {}
  }
}

export const saveSettings = async (
  workspacePath: string,
  settings: WorkspaceSettings
): Promise<void> => {
  try {
    const stateDir = join(workspacePath, WORKSPACE_STATE_DIR)

    // Ensure the .mdit directory exists before writing
    if (!(await exists(stateDir))) {
      await mkdir(stateDir, { recursive: true })
    }

    // Load existing config to preserve fields not being updated
    const existingConfig = await loadSettings(workspacePath)
    const mergedConfig: WorkspaceSettings = {
      ...existingConfig,
      ...settings,
    }

    const configPath = getWorkspaceConfigPath(workspacePath)
    await writeTextFile(configPath, JSON.stringify(mergedConfig, null, 2))
  } catch (error) {
    console.error('Failed to save settings to file:', error)
  }
}
