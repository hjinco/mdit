import { Command } from '@tauri-apps/plugin-shell'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useGitSyncStore } from '@/store/git-sync-store'

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

// Regex to match git status branch.ab output: "# branch.ab +1 -2"
const BRANCH_AB_REGEX = /# branch\.ab ([+-]\d+) ([+-]\d+)/

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

      if (!workspacePath || !isRepo || state.status === 'error') {
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
  }, [workspacePath, refreshStatus, state.status])

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
      await ensureGitSuccess(workspacePath, ['add', '--all'])

      const config = getSyncConfig(workspacePath)
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

      const branchName = config.branchName.trim()
      const branch = branchName || (await getCurrentBranch(workspacePath))

      await ensureGitSuccess(workspacePath, ['push', 'origin', branch])

      setState((prev) => ({
        ...prev,
        status: 'synced',
        error: null,
      }))
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
  }, [workspacePath, getSyncConfig])

  // Auto sync interval: runs every minute when autoSync is enabled and status is unsynced
  useEffect(() => {
    if (!workspacePath || !state.isGitRepo) {
      return
    }

    const config = getSyncConfig(workspacePath)
    if (!config.autoSync) {
      return
    }

    let autoSyncIntervalId: ReturnType<typeof setInterval> | null = null

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

    return () => {
      if (autoSyncIntervalId) {
        clearInterval(autoSyncIntervalId)
      }
    }
  }, [workspacePath, state.isGitRepo, getSyncConfig, sync])

  console.log('state', state)

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
    const result = await executeGit(workspacePath, [
      'rev-parse',
      '--is-inside-work-tree',
    ])

    return result.code === 0 && result.stdout.trim() === 'true'
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
  // Ask Git for a branch-aware status snapshot. The porcelain v2 format is stable
  // to parse and includes ahead/behind counts that let us flag divergence.
  const result = await ensureGitSuccess(workspacePath, [
    'status',
    '--porcelain=2',
    '--branch',
  ])

  const lines = result.stdout.split('\n')
  let hasChanges = false
  let aheadCount = 0
  let behindCount = 0
  let hasUpstream = false

  for (const raw of lines) {
    const line = raw.trim()

    if (!line) {
      continue
    }

    if (line.startsWith('# branch.upstream')) {
      const upstream = line.slice('# branch.upstream'.length).trim()
      if (upstream) {
        hasUpstream = true
      }
      continue
    }

    if (line.startsWith('# branch.ab')) {
      // Example: "# branch.ab +1 -2" -> ahead of remote by one commit, behind by two.
      const match = line.match(BRANCH_AB_REGEX)
      if (match) {
        const ahead = Number.parseInt(match[1], 10)
        const behind = Number.parseInt(match[2], 10)
        if (!Number.isNaN(ahead) && ahead > 0) {
          aheadCount = ahead
        }
        if (!Number.isNaN(behind) && behind > 0) {
          behindCount = behind
        } else if (!Number.isNaN(behind) && behind < 0) {
          behindCount = Math.abs(behind)
        }
      }
      continue
    }

    if (!line.startsWith('#')) {
      // Any non-comment line indicates staged, unstaged, or untracked changes.
      hasChanges = true
      break
    }
  }

  if (hasChanges) {
    return { status: 'unsynced' }
  }

  if (aheadCount > 0 || behindCount > 0) {
    return { status: 'unsynced' }
  }

  // If upstream is not configured, consider synced if local working tree is clean.
  // Upstream is only needed for remote synchronization; local-only repos can be synced.
  if (!hasUpstream) {
    return { status: 'synced' }
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
