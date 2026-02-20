import type { GitPorts } from "./ports"
import type {
	GitExecResult,
	GitSyncStatus,
	SyncConfig,
	SyncResult,
} from "./types"

export type GitSyncCore = {
	isGitRepository: (workspacePath: string) => Promise<boolean>
	detectSyncStatus: (workspacePath: string) => Promise<GitSyncStatus>
	sync: (workspacePath: string, config: SyncConfig) => Promise<SyncResult>
	getCurrentBranch: (workspacePath: string) => Promise<string>
	hasChangesToCommit: (workspacePath: string) => Promise<boolean>
	getCurrentCommitHash: (workspacePath: string) => Promise<string | null>
	ensureGitignoreEntry: (workspacePath: string) => Promise<void>
}

export const createGitSyncCore = (ports: GitPorts): GitSyncCore => {
	let gitInstalled: boolean | null = null

	const executeGit = async (
		workspacePath: string,
		args: string[],
	): Promise<GitExecResult> => {
		return ports.gitExec(workspacePath, args)
	}

	const ensureGitSuccess = async (
		workspacePath: string,
		args: string[],
	): Promise<GitExecResult> => {
		const result = await executeGit(workspacePath, args)

		if (result.code !== 0) {
			throw new Error(result.stderr || result.stdout || `git ${args[0]} failed`)
		}

		return result
	}

	const formatDateForCommit = (date: Date): string => {
		const year = date.getFullYear()
		const month = String(date.getMonth() + 1).padStart(2, "0")
		const day = String(date.getDate()).padStart(2, "0")
		const hours = String(date.getHours()).padStart(2, "0")
		const minutes = String(date.getMinutes()).padStart(2, "0")
		return `${year}-${month}-${day} ${hours}:${minutes}`
	}

	const buildSyncCommitMessage = (customMessage?: string): string => {
		if (customMessage?.trim()) {
			return customMessage.replace("{date}", formatDateForCommit(ports.now()))
		}
		return `mdit: ${formatDateForCommit(ports.now())}`
	}

	const isGitInstalled = async (workspacePath: string): Promise<boolean> => {
		if (gitInstalled !== null) {
			return gitInstalled
		}

		try {
			const result = await executeGit(workspacePath, ["--version"])
			gitInstalled = result.code === 0
			return gitInstalled
		} catch {
			gitInstalled = false
			return false
		}
	}

	const getCurrentBranch = async (workspacePath: string): Promise<string> => {
		const result = await ensureGitSuccess(workspacePath, [
			"rev-parse",
			"--abbrev-ref",
			"HEAD",
		])
		const branch = result.stdout.trim()

		if (!branch || branch === "HEAD") {
			throw new Error("Unable to determine current branch.")
		}

		return branch
	}

	const hasChangesToCommit = async (
		workspacePath: string,
	): Promise<boolean> => {
		const diff = await executeGit(workspacePath, [
			"diff",
			"--cached",
			"--name-only",
		])

		if (diff.code !== 0) {
			throw new Error(diff.stderr || "git diff failed")
		}

		return diff.stdout.trim().length > 0
	}

	const getCurrentCommitHash = async (
		workspacePath: string,
	): Promise<string | null> => {
		const result = await executeGit(workspacePath, ["rev-parse", "HEAD"])

		if (result.code !== 0) {
			const stderr = result.stderr?.toLowerCase() ?? ""
			const isInitialRepo =
				stderr.includes("needed a single revision") ||
				stderr.includes("ambiguous argument") ||
				stderr.includes("unknown revision") ||
				stderr.includes("does not have any commits yet")

			if (isInitialRepo) {
				return null
			}

			throw new Error(result.stderr || result.stdout || "git rev-parse failed")
		}

		const hash = result.stdout.trim()
		return hash ? hash : null
	}

	const isGitRepository = async (workspacePath: string): Promise<boolean> => {
		if (!(await isGitInstalled(workspacePath))) {
			return false
		}

		try {
			const repoResult = await executeGit(workspacePath, [
				"rev-parse",
				"--is-inside-work-tree",
			])

			if (repoResult.code !== 0 || repoResult.stdout.trim() !== "true") {
				return false
			}

			const originResult = await executeGit(workspacePath, [
				"remote",
				"get-url",
				"origin",
			])
			return originResult.code === 0 && originResult.stdout.trim().length > 0
		} catch {
			return false
		}
	}

	const detectSyncStatus = async (
		workspacePath: string,
	): Promise<GitSyncStatus> => {
		const originCheckResult = await executeGit(workspacePath, [
			"remote",
			"get-url",
			"origin",
		])
		const hasOrigin =
			originCheckResult.code === 0 && originCheckResult.stdout.trim().length > 0

		if (hasOrigin) {
			await ensureGitSuccess(workspacePath, ["fetch", "origin"])
		}

		const statusResult = await ensureGitSuccess(workspacePath, [
			"status",
			"--porcelain=2",
		])
		const hasChanges = statusResult.stdout
			.split("\n")
			.some((line) => line.trim() && !line.trim().startsWith("#"))

		if (hasChanges) {
			return "unsynced"
		}

		if (!hasOrigin) {
			return "synced"
		}

		const branch = await getCurrentBranch(workspacePath)
		const originBranchCheck = await executeGit(workspacePath, [
			"rev-parse",
			"--verify",
			`origin/${branch}`,
		])

		if (originBranchCheck.code !== 0) {
			return "synced"
		}

		const aheadResult = await executeGit(workspacePath, [
			"rev-list",
			"--count",
			`origin/${branch}..HEAD`,
		])
		const behindResult = await executeGit(workspacePath, [
			"rev-list",
			"--count",
			`HEAD..origin/${branch}`,
		])

		const aheadCount =
			aheadResult.code === 0
				? Number.parseInt(aheadResult.stdout.trim(), 10) || 0
				: 0
		const behindCount =
			behindResult.code === 0
				? Number.parseInt(behindResult.stdout.trim(), 10) || 0
				: 0

		return aheadCount > 0 || behindCount > 0 ? "unsynced" : "synced"
	}

	const sync = async (
		workspacePath: string,
		config: SyncConfig,
	): Promise<SyncResult> => {
		const branchName = config.branchName.trim()
		const branch = branchName || (await getCurrentBranch(workspacePath))

		const commitHashBeforePull = await getCurrentCommitHash(workspacePath)
		await ensureGitSuccess(workspacePath, ["pull", "--", "origin", branch])
		const commitHashAfterPull = await getCurrentCommitHash(workspacePath)

		await ensureGitSuccess(workspacePath, ["add", "--all"])

		if (await hasChangesToCommit(workspacePath)) {
			const commitResult = await executeGit(workspacePath, [
				"commit",
				"-m",
				buildSyncCommitMessage(config.commitMessage),
			])

			if (commitResult.code !== 0) {
				throw new Error(
					commitResult.stderr || commitResult.stdout || "git commit failed",
				)
			}
		}

		await ensureGitSuccess(workspacePath, ["push", "--", "origin", branch])

		const isInitialRepo =
			commitHashBeforePull === null || commitHashAfterPull === null
		const pulledChanges =
			!isInitialRepo && commitHashBeforePull !== commitHashAfterPull

		return { success: true, pulledChanges }
	}

	const ensureGitignoreEntry = async (workspacePath: string): Promise<void> => {
		const mditDir = ports.join(workspacePath, ".mdit")
		const gitignorePath = ports.join(mditDir, ".gitignore")
		const entries = ["db.sqlite", ".DS_Store", "workspace.json"]

		try {
			if (!(await ports.exists(mditDir))) {
				await ports.mkdir(mditDir, { recursive: true })
			}

			let content = ""
			try {
				content = await ports.readTextFile(gitignorePath)
			} catch {
				content = ""
			}

			const lines = content.split("\n")
			const missingEntries = entries.filter((entry) => {
				const normalizedEntry = entry.trim()
				return !lines.some(
					(line) =>
						line.trim() === normalizedEntry ||
						line.trim() === `/${normalizedEntry}`,
				)
			})

			if (missingEntries.length > 0) {
				const entriesToAdd = missingEntries.join("\n")
				const nextContent = content.trim()
					? `${content.trim()}\n${entriesToAdd}`
					: entriesToAdd
				await ports.writeTextFile(gitignorePath, nextContent)
			}
		} catch {
			// Ignore gitignore maintenance errors to avoid blocking sync flow.
		}
	}

	return {
		isGitRepository,
		detectSyncStatus,
		sync,
		getCurrentBranch,
		hasChangesToCommit,
		getCurrentCommitHash,
		ensureGitignoreEntry,
	}
}
