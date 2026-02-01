import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs'
import { Command } from '@tauri-apps/plugin-shell'
import { join } from 'pathe'

export type GitSyncStatus = 'syncing' | 'synced' | 'unsynced' | 'error'

export type SyncConfig = {
  branchName: string
  commitMessage: string
  autoSync: boolean
}

export type SyncResult = {
  success: boolean
  pulledChanges: boolean
  error?: string
}

const checkGitInstalled = (() => {
  let gitInstalled: boolean | null = null

  return async () => {
    if (gitInstalled !== null) {
      return gitInstalled
    }

    try {
      const command = Command.create('git', ['--version'])
      const result = await command.execute()
      gitInstalled = result.code === 0
      return gitInstalled
    } catch {
      gitInstalled = false
      return false
    }
  }
})()

export class GitService {
  private readonly workspacePath: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
  }

  async isGitRepository(): Promise<boolean> {
    if (!(await checkGitInstalled())) {
      return false
    }

    try {
      const repoResult = await this.executeGit([
        'rev-parse',
        '--is-inside-work-tree',
      ])

      if (repoResult.code !== 0 || repoResult.stdout.trim() !== 'true') {
        return false
      }

      const originResult = await this.executeGit([
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

  async detectSyncStatus(): Promise<GitSyncStatus> {
    const originCheckResult = await this.executeGit([
      'remote',
      'get-url',
      'origin',
    ])

    const hasOrigin =
      originCheckResult.code === 0 && originCheckResult.stdout.trim().length > 0

    if (hasOrigin) {
      await this.ensureGitSuccess(['fetch', 'origin'])
    }

    const result = await this.ensureGitSuccess(['status', '--porcelain=2'])

    const lines = result.stdout.split('\n')
    let hasChanges = false

    for (const raw of lines) {
      const line = raw.trim()
      if (line && !line.startsWith('#')) {
        hasChanges = true
        break
      }
    }

    if (hasChanges) {
      return 'unsynced'
    }

    if (!hasOrigin) {
      return 'synced'
    }

    const branch = await this.getCurrentBranch()
    const originBranchCheck = await this.executeGit([
      'rev-parse',
      '--verify',
      `origin/${branch}`,
    ])

    if (originBranchCheck.code !== 0) {
      return 'synced'
    }

    const aheadResult = await this.executeGit([
      'rev-list',
      '--count',
      `origin/${branch}..HEAD`,
    ])
    const behindResult = await this.executeGit([
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
      return 'unsynced'
    }

    return 'synced'
  }

  async sync(config: SyncConfig): Promise<SyncResult> {
    const branchName = config.branchName.trim()
    const branch = branchName || (await this.getCurrentBranch())

    const commitHashBeforePull = await this.getCurrentCommitHash()

    await this.ensureGitSuccess(['pull', 'origin', branch])

    const commitHashAfterPull = await this.getCurrentCommitHash()

    await this.ensureGitSuccess(['add', '--all'])

    const shouldCommit = await this.hasChangesToCommit()

    if (shouldCommit) {
      const commitMessage = this.buildSyncCommitMessage(config.commitMessage)
      const commitResult = await this.executeGit([
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

    await this.ensureGitSuccess(['push', 'origin', branch])

    const isInitialRepo =
      commitHashBeforePull === null || commitHashAfterPull === null
    const pulledChanges =
      !isInitialRepo && commitHashBeforePull !== commitHashAfterPull

    return { success: true, pulledChanges }
  }

  async getCurrentBranch(): Promise<string> {
    const result = await this.ensureGitSuccess([
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

  async hasChangesToCommit(): Promise<boolean> {
    const diff = await this.executeGit(['diff', '--cached', '--name-only'])

    if (diff.code !== 0) {
      throw new Error(diff.stderr || 'git diff failed')
    }

    return diff.stdout.trim().length > 0
  }

  async getCurrentCommitHash(): Promise<string | null> {
    const result = await this.executeGit(['rev-parse', 'HEAD'])

    if (result.code !== 0) {
      const stderr = result.stderr?.toLowerCase() ?? ''
      const isInitialRepo =
        stderr.includes('needed a single revision') ||
        stderr.includes('ambiguous argument') ||
        stderr.includes('unknown revision') ||
        stderr.includes('does not have any commits yet')

      if (isInitialRepo) {
        return null
      }

      throw new Error(result.stderr || result.stdout || 'git rev-parse failed')
    }

    const hash = result.stdout.trim()
    return hash ? hash : null
  }

  async ensureGitignoreEntry(): Promise<void> {
    const mditDir = join(this.workspacePath, '.mdit')
    const gitignorePath = join(mditDir, '.gitignore')
    const entries = ['db.sqlite', '.DS_Store', 'workspace.json']

    try {
      if (!(await exists(mditDir))) {
        await mkdir(mditDir, { recursive: true })
      }

      let content = ''
      try {
        content = await readTextFile(gitignorePath)
      } catch {
        content = ''
      }

      const lines = content.split('\n')
      const missingEntries: string[] = []

      for (const entry of entries) {
        const normalizedEntry = entry.trim()
        const hasEntry = lines.some(
          (line) =>
            line.trim() === normalizedEntry ||
            line.trim() === `/${normalizedEntry}`
        )

        if (!hasEntry) {
          missingEntries.push(entry)
        }
      }

      if (missingEntries.length > 0) {
        const entriesToAdd = missingEntries.join('\n')
        const newContent = content.trim()
          ? `${content.trim()}\n${entriesToAdd}`
          : entriesToAdd

        await writeTextFile(gitignorePath, newContent)
      }
    } catch (error) {
      console.warn('Failed to update .gitignore:', error)
    }
  }

  private async executeGit(
    args: string[]
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    const command = Command.create('git', ['-C', this.workspacePath, ...args])
    const result = await command.execute()
    return {
      code: result.code ?? 0,
      stdout: result.stdout,
      stderr: result.stderr,
    }
  }

  private async ensureGitSuccess(
    args: string[]
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    const result = await this.executeGit(args)

    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `git ${args[0]} failed`)
    }

    return result
  }

  private buildSyncCommitMessage(customMessage?: string): string {
    if (customMessage?.trim()) {
      return customMessage.replace(
        '{date}',
        this.formatDateForCommit(new Date())
      )
    }
    return `mdit: ${this.formatDateForCommit(new Date())}`
  }

  private formatDateForCommit(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }
}
