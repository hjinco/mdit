import { create } from 'zustand'
import { loadSettings, saveSettings } from '@/lib/settings-utils'

type SyncConfig = {
  branchName: string
  commitMessage: string
  autoSync: boolean
}

type GitSyncStore = {
  getSyncConfig: (workspacePath: string | null) => Promise<SyncConfig>
  setBranchName: (workspacePath: string, branchName: string) => Promise<void>
  setCommitMessage: (
    workspacePath: string,
    commitMessage: string
  ) => Promise<void>
  setAutoSync: (workspacePath: string, autoSync: boolean) => Promise<void>
}

const DEFAULT_CONFIG: SyncConfig = {
  branchName: '',
  commitMessage: '',
  autoSync: false,
}

export const useGitSyncStore = create<GitSyncStore>(() => ({
  getSyncConfig: async (workspacePath: string | null) => {
    if (!workspacePath) {
      return DEFAULT_CONFIG
    }

    const settings = await loadSettings(workspacePath)
    const gitSync = settings.gitSync

    return {
      branchName: gitSync?.branchName ?? '',
      commitMessage: gitSync?.commitMessage ?? '',
      autoSync: gitSync?.autoSync ?? false,
    }
  },

  setBranchName: async (workspacePath: string, branchName: string) => {
    const settings = await loadSettings(workspacePath)
    const currentGitSync = settings.gitSync ?? {
      branchName: '',
      commitMessage: '',
      autoSync: false,
    }

    await saveSettings(workspacePath, {
      ...settings,
      gitSync: {
        ...currentGitSync,
        branchName,
      },
    })
  },

  setCommitMessage: async (workspacePath: string, commitMessage: string) => {
    const settings = await loadSettings(workspacePath)
    const currentGitSync = settings.gitSync ?? {
      branchName: '',
      commitMessage: '',
      autoSync: false,
    }

    await saveSettings(workspacePath, {
      ...settings,
      gitSync: {
        ...currentGitSync,
        commitMessage,
      },
    })
  },

  setAutoSync: async (workspacePath: string, autoSync: boolean) => {
    const settings = await loadSettings(workspacePath)
    const currentGitSync = settings.gitSync ?? {
      branchName: '',
      commitMessage: '',
      autoSync: false,
    }

    await saveSettings(workspacePath, {
      ...settings,
      gitSync: {
        ...currentGitSync,
        autoSync,
      },
    })
  },
}))
