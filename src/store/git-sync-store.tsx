import { create } from 'zustand'

type SyncConfig = {
  branchName: string
  commitMessage: string
  autoSync: boolean
}

const getStorageKey = (workspacePath: string) => {
  return `w:${workspacePath}:git-sync-config`
}

const getStoredSyncConfig = (workspacePath: string): SyncConfig | null => {
  if (typeof window === 'undefined') return null

  try {
    const stored = window.localStorage.getItem(getStorageKey(workspacePath))
    if (!stored) return null

    const parsed = JSON.parse(stored) as Partial<SyncConfig>
    return {
      branchName: parsed.branchName ?? '',
      commitMessage: parsed.commitMessage ?? '',
      autoSync: parsed.autoSync ?? false,
    }
  } catch (error) {
    console.error('Failed to read git sync config from storage:', error)
    return null
  }
}

const persistSyncConfig = (workspacePath: string, config: SyncConfig) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      getStorageKey(workspacePath),
      JSON.stringify(config)
    )
  } catch (error) {
    console.error('Failed to persist git sync config:', error)
  }
}

type GitSyncStore = {
  getSyncConfig: (workspacePath: string | null) => SyncConfig
  setBranchName: (workspacePath: string, branchName: string) => void
  setCommitMessage: (workspacePath: string, commitMessage: string) => void
  setAutoSync: (workspacePath: string, autoSync: boolean) => void
}

const DEFAULT_CONFIG: SyncConfig = {
  branchName: '',
  commitMessage: '',
  autoSync: false,
}

export const useGitSyncStore = create<GitSyncStore>((_set, get) => ({
  getSyncConfig: (workspacePath: string | null) => {
    if (!workspacePath) {
      return DEFAULT_CONFIG
    }

    const stored = getStoredSyncConfig(workspacePath)
    return stored ?? DEFAULT_CONFIG
  },

  setBranchName: (workspacePath: string, branchName: string) => {
    const currentConfig = get().getSyncConfig(workspacePath)
    const newConfig: SyncConfig = {
      ...currentConfig,
      branchName,
    }
    persistSyncConfig(workspacePath, newConfig)
  },

  setCommitMessage: (workspacePath: string, commitMessage: string) => {
    const currentConfig = get().getSyncConfig(workspacePath)
    const newConfig: SyncConfig = {
      ...currentConfig,
      commitMessage,
    }
    persistSyncConfig(workspacePath, newConfig)
  },

  setAutoSync: (workspacePath: string, autoSync: boolean) => {
    const currentConfig = get().getSyncConfig(workspacePath)
    const newConfig: SyncConfig = {
      ...currentConfig,
      autoSync,
    }
    persistSyncConfig(workspacePath, newConfig)
  },
}))
