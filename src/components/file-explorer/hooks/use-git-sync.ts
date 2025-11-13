import { Command } from '@tauri-apps/plugin-shell'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useGitSyncStore } from '@/store/git-sync-store'
import { useTabStore } from '@/store/tab-store'
import { useWorkspaceStore } from '@/store/workspace-store'

// Finite representation of the sync lifecycle states the hook can emit.
type GitSyncStatus = 'syncing' | 'synced' | 'unsynced' | 'error'

type GitSyncState = {
  isGitRepo: boolean
  status: GitSyncStatus
  lastUpdated: number | null
  error: string | null
}

const POLL_INTERVAL_MS = 5000
const AUTO_SYNC_INTERVAL_MS = 60_000 // 1 minute

const EMPTY_STATE: GitSyncState = {
  isGitRepo: false,
  status: 'synced',
  lastUpdated: null,
  error: null,
}

export function useGitSync(workspacePath: string | null) {
  const [state, setState] = useState<GitSyncState>(EMPTY_STATE)
  const getSyncConfig = useGitSyncStore((state) => state.getSyncConfig)
  const isSyncingRef = useRef(false)

  // Returns the hook to a neutral, non-repo state.
  const resetState = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isGitRepo: false,
      status: 'synced',
      lastUpdated: Date.now(),
      error: null,
    }))
  }, [])

  const refreshStatus = useCallback(async () => {
    if (!workspacePath) {
      resetState()
      return
    }

    try {
      const isRepo = await isGitRepository(workspacePath)

      if (!isRepo) {
        resetState()
        return false
      }

      const { status: syncStatus } = await detectSyncStatus(workspacePath)

      setState((prev) =>
        prev.status === 'error'
          ? prev
          : {
              ...prev,
              isGitRepo: true,
              status: syncStatus,
              lastUpdated: Date.now(),
              error: null,
            }
      )

      return true
    } catch (error) {
      console.error('Failed to refresh git status:', error)

      const message =
        error instanceof Error ? error.message : String(error ?? 'Unknown')

      setState((prev) => ({
        ...prev,
        isGitRepo: false,
        status: 'error',
        lastUpdated: Date.now(),
        error: message,
      }))

      return false
    }
  }, [resetState, workspacePath])

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null
    let isDisposed = false

    // Perform an immediate status check, then keep polling while the workspace stays mounted.
    const initialize = async () => {
      const isRepo = await refreshStatus()

      if (isDisposed) {
        return
      }

      if (!workspacePath || !isRepo) {
        return
      }

      intervalId = setInterval(() => {
        refreshStatus()
      }, POLL_INTERVAL_MS)
    }

    initialize()

    return () => {
      isDisposed = true

      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [workspacePath, refreshStatus])

  const sync = useCallback(async () => {
    if (!workspacePath || isSyncingRef.current) {
      return
    }

    isSyncingRef.current = true

    // Clear previous errors and surface an explicit "syncing" status for the UI.
    setState((prev) => ({
      ...prev,
      status: 'syncing',
      error: null,
    }))

    try {
      const config = await getSyncConfig(workspacePath)
      const branchName = config.branchName.trim()
      const branch = branchName || (await getCurrentBranch(workspacePath))

      // Pull from remote first
      await ensureGitSuccess(workspacePath, ['pull', 'origin', branch])

      await ensureGitSuccess(workspacePath, ['add', '--all'])

      const shouldCommit = await hasChangesToCommit(workspacePath)

      if (shouldCommit) {
        const commitMessage = buildSyncCommitMessage(config.commitMessage)
        const commitResult = await executeGit(workspacePath, [
          'commit',
          '-m',
          commitMessage,
        ])

        if (commitResult.code !== 0) {
          throw new Error(
            commitResult.stderr || commitResult.stdout || 'git commit failed'
          )
        }
      }

      await ensureGitSuccess(workspacePath, ['push', 'origin', branch])

      // Refresh status after sync
      await refreshStatus()

      // Sync succeeded - refresh workspace entries and reopen current tab
      await useWorkspaceStore.getState().refreshWorkspaceEntries()
      const currentTabPath = useTabStore.getState().tab?.path

      if (currentTabPath) {
        await useTabStore.getState().openTab(currentTabPath, false, true)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? 'Unknown')

      console.error('Failed to sync workspace:', error)

      setState((prev) => ({
        ...prev,
        status: 'error',
        error: message,
      }))
    } finally {
      isSyncingRef.current = false
    }
  }, [workspacePath, getSyncConfig, refreshStatus])

  // Auto sync interval: runs every minute when autoSync is enabled and status is unsynced
  useEffect(() => {
    if (!workspacePath || !state.isGitRepo) {
      return
    }

    let autoSyncIntervalId: ReturnType<typeof setInterval> | null = null
    let isDisposed = false

    const initialize = async () => {
      const config = await getSyncConfig(workspacePath)

      if (isDisposed) {
        return
      }

      if (!config.autoSync) {
        return
      }

      const tryAutoSync = async () => {
        // Only sync if status is unsynced and no sync is already in progress
        // Use ref to get the latest status, not the stale closure value
        if (!isSyncingRef.current) {
          await sync()
        }
      }

      // Set up interval to check and sync every minute
      autoSyncIntervalId = setInterval(() => {
        tryAutoSync()
      }, AUTO_SYNC_INTERVAL_MS)
    }

    initialize()

    return () => {
      isDisposed = true

      if (autoSyncIntervalId) {
        clearInterval(autoSyncIntervalId)
      }
    }
  }, [workspacePath, state.isGitRepo, getSyncConfig, sync])

  return {
    isGitRepo: state.isGitRepo,
    status: state.status,
    lastUpdated: state.lastUpdated,
    error: state.error,
    refresh: refreshStatus,
    sync,
  }
}

async function isGitRepository(workspacePath: string) {
  try {
    // Check if it's a git repository
    const repoResult = await executeGit(workspacePath, [
      'rev-parse',
      '--is-inside-work-tree',
    ])

    if (repoResult.code !== 0 || repoResult.stdout.trim() !== 'true') {
      return false
    }

    // Check if origin remote is configured
    const originResult = await executeGit(workspacePath, [
      'remote',
      'get-url',
      'origin',
    ])

    return originResult.code === 0 && originResult.stdout.trim().length > 0
  } catch (error) {
    console.warn('Failed to detect git repository:', error)
    return false
  }
}

async function ensureGitSuccess(workspacePath: string, args: string[]) {
  const result = await executeGit(workspacePath, args)

  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args[0]} failed`)
  }

  return result
}

async function detectSyncStatus(
  workspacePath: string
): Promise<{ status: GitSyncStatus }> {
  // Check if origin remote exists
  const originCheckResult = await executeGit(workspacePath, [
    'remote',
    'get-url',
    'origin',
  ])

  const hasOrigin =
    originCheckResult.code === 0 && originCheckResult.stdout.trim().length > 0

  // Fetch from origin if it exists
  if (hasOrigin) {
    await ensureGitSuccess(workspacePath, ['fetch', 'origin'])
  }

  // Check for local working tree changes
  const result = await ensureGitSuccess(workspacePath, [
    'status',
    '--porcelain=2',
  ])

  const lines = result.stdout.split('\n')
  let hasChanges = false

  for (const raw of lines) {
    const line = raw.trim()
    if (line && !line.startsWith('#')) {
      // Any non-comment line indicates staged, unstaged, or untracked changes.
      hasChanges = true
      break
    }
  }

  if (hasChanges) {
    return { status: 'unsynced' }
  }

  // If origin doesn't exist, consider synced if local working tree is clean.
  if (!hasOrigin) {
    return { status: 'synced' }
  }

  // Compare local branch with origin/branchName directly
  const branch = await getCurrentBranch(workspacePath)
  const originBranchCheck = await executeGit(workspacePath, [
    'rev-parse',
    '--verify',
    `origin/${branch}`,
  ])

  // If origin/branch doesn't exist, consider synced
  if (originBranchCheck.code !== 0) {
    return { status: 'synced' }
  }

  // Compare local branch with origin/branch
  const aheadResult = await executeGit(workspacePath, [
    'rev-list',
    '--count',
    `origin/${branch}..HEAD`,
  ])
  const behindResult = await executeGit(workspacePath, [
    'rev-list',
    '--count',
    `HEAD..origin/${branch}`,
  ])

  let aheadCount = 0
  let behindCount = 0

  if (aheadResult.code === 0) {
    const ahead = Number.parseInt(aheadResult.stdout.trim(), 10)
    if (!Number.isNaN(ahead) && ahead > 0) {
      aheadCount = ahead
    }
  }

  if (behindResult.code === 0) {
    const behind = Number.parseInt(behindResult.stdout.trim(), 10)
    if (!Number.isNaN(behind) && behind > 0) {
      behindCount = behind
    }
  }

  if (aheadCount > 0 || behindCount > 0) {
    return { status: 'unsynced' }
  }

  return { status: 'synced' }
}

async function hasChangesToCommit(workspacePath: string) {
  const diff = await executeGit(workspacePath, [
    'diff',
    '--cached',
    '--name-only',
  ])

  if (diff.code !== 0) {
    throw new Error(diff.stderr || 'git diff failed')
  }

  return diff.stdout.trim().length > 0
}

async function getCurrentBranch(workspacePath: string) {
  const result = await ensureGitSuccess(workspacePath, [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ])

  const branch = result.stdout.trim()

  if (!branch || branch === 'HEAD') {
    throw new Error('Unable to determine current branch.')
  }

  return branch
}

function buildSyncCommitMessage(customMessage?: string) {
  if (customMessage?.trim()) {
    // Replace {date} placeholder if present
    return customMessage.replace('{date}', new Date().toISOString())
  }
  return `chore: sync workspace (${new Date().toISOString()})`
}

async function executeGit(workspacePath: string, args: string[]) {
  const command = Command.create('git', ['-C', workspacePath, ...args])
  return command.execute()
}
