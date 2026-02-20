import { describe, expect, it, vi } from "vitest"
import { createGitSyncCore } from "./git-sync-core"
import type { GitPorts } from "./ports"
import type { GitExecResult } from "./types"

type GitHandler =
	| GitExecResult
	| GitExecResult[]
	| ((args: string[]) => GitExecResult | Promise<GitExecResult>)

const commandKey = (args: string[]) => args.join("\u001f")
const ok = (stdout = ""): GitExecResult => ({ code: 0, stdout, stderr: "" })
const err = (stderr: string): GitExecResult => ({ code: 1, stdout: "", stderr })
const formatDate = (date: Date) => {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	const hours = String(date.getHours()).padStart(2, "0")
	const minutes = String(date.getMinutes()).padStart(2, "0")
	return `${year}-${month}-${day} ${hours}:${minutes}`
}

const createHandlers = (entries: Array<[string[], GitHandler]>) => {
	const handlers = new Map<string, GitHandler>()
	for (const [args, handler] of entries) {
		handlers.set(commandKey(args), handler)
	}
	return handlers
}

const createCore = ({
	workspacePath = "/workspace",
	handlers = new Map<string, GitHandler>(),
	files = {} as Record<string, string>,
	now = new Date(2026, 0, 2, 3, 4, 0),
}: {
	workspacePath?: string
	handlers?: Map<string, GitHandler>
	files?: Record<string, string>
	now?: Date
} = {}) => {
	const fileStore = new Map(Object.entries(files))
	const directoryStore = new Set<string>([workspacePath])

	const gitExec = vi.fn(async (args: string[]) => {
		const key = commandKey(args)
		const handler = handlers.get(key)

		if (!handler) {
			return ok()
		}

		if (Array.isArray(handler)) {
			const next = handler.shift()
			return next ?? ok()
		}

		if (typeof handler === "function") {
			return handler(args)
		}

		return handler
	})

	const ports: GitPorts = {
		gitExec: async (_workspacePath, args) => gitExec(args),
		exists: async (path) => directoryStore.has(path) || fileStore.has(path),
		mkdir: async (path) => {
			directoryStore.add(path)
		},
		readTextFile: async (path) => {
			if (!fileStore.has(path)) {
				throw new Error("ENOENT")
			}
			return fileStore.get(path) as string
		},
		writeTextFile: async (path, content) => {
			fileStore.set(path, content)
		},
		join: (...paths) => paths.join("/").replace(/\/+/g, "/").replace(/\/$/, ""),
		now: () => now,
	}

	return {
		core: createGitSyncCore(ports),
		gitExec,
		fileStore,
		workspacePath,
	}
}

describe("GitSyncCore", () => {
	it("returns false when git is not installed", async () => {
		const handlers = createHandlers([
			[["--version"], err("git: command not found")],
		])
		const { core, workspacePath } = createCore({ handlers })

		await expect(core.isGitRepository(workspacePath)).resolves.toBe(false)
	})

	it("detects unsynced state when working tree has local changes", async () => {
		const handlers = createHandlers([
			[["remote", "get-url", "origin"], ok("git@example.com:repo.git\n")],
			[["fetch", "origin"], ok()],
			[
				["status", "--porcelain=2"],
				ok("1 .M N... 100644 100644 100644 abc abc note.md\n"),
			],
		])
		const { core, workspacePath } = createCore({ handlers })

		await expect(core.detectSyncStatus(workspacePath)).resolves.toBe("unsynced")
	})

	it("detects unsynced state when branch is ahead of origin", async () => {
		const handlers = createHandlers([
			[["remote", "get-url", "origin"], ok("git@example.com:repo.git\n")],
			[["fetch", "origin"], ok()],
			[["status", "--porcelain=2"], ok("# branch.oid abc\n")],
			[["rev-parse", "--abbrev-ref", "HEAD"], ok("main\n")],
			[["rev-parse", "--verify", "origin/main"], ok("abc\n")],
			[["rev-list", "--count", "origin/main..HEAD"], ok("1\n")],
			[["rev-list", "--count", "HEAD..origin/main"], ok("0\n")],
		])
		const { core, workspacePath } = createCore({ handlers })

		await expect(core.detectSyncStatus(workspacePath)).resolves.toBe("unsynced")
	})

	it("detects unsynced state when origin branch is missing but local commits exist", async () => {
		const handlers = createHandlers([
			[["remote", "get-url", "origin"], ok("git@example.com:repo.git\n")],
			[["fetch", "origin"], ok()],
			[["status", "--porcelain=2"], ok("# branch.oid abc\n")],
			[["rev-parse", "--abbrev-ref", "HEAD"], ok("feature/new-branch\n")],
			[["rev-parse", "--verify", "origin/feature/new-branch"], err("fatal")],
			[["rev-parse", "HEAD"], ok("abc123\n")],
		])
		const { core, workspacePath } = createCore({ handlers })

		await expect(core.detectSyncStatus(workspacePath)).resolves.toBe("unsynced")
	})

	it("syncs and applies commit message date templating", async () => {
		const fixedDate = new Date(2026, 0, 2, 3, 4, 0)
		const expectedCommitMessage = `sync ${formatDate(fixedDate)}`
		const handlers = createHandlers([
			[
				["rev-parse", "HEAD"],
				[ok("before\n"), ok("after\n")],
			],
			[["pull", "--", "origin", "main"], ok()],
			[["add", "--all"], ok()],
			[["diff", "--cached", "--name-only"], ok("note.md\n")],
			[["commit", "-m", expectedCommitMessage], ok("[main abc] sync")],
			[["push", "--", "origin", "main"], ok()],
		])
		const { core, gitExec, workspacePath } = createCore({
			handlers,
			now: fixedDate,
		})

		const result = await core.sync(workspacePath, {
			branchName: "main",
			commitMessage: "sync {date}",
			autoSync: false,
		})

		expect(result).toEqual({ success: true, pulledChanges: true })
		expect(gitExec).toHaveBeenCalledWith([
			"commit",
			"-m",
			expectedCommitMessage,
		])
	})

	it("treats missing HEAD as pulled changes when first commit is fetched", async () => {
		const handlers = createHandlers([
			[
				["rev-parse", "HEAD"],
				[err("fatal: needed a single revision"), ok("after-first-pull\n")],
			],
			[["pull", "--", "origin", "main"], ok()],
			[["add", "--all"], ok()],
			[["diff", "--cached", "--name-only"], ok("")],
			[["push", "--", "origin", "main"], ok()],
		])
		const { core, gitExec, workspacePath } = createCore({ handlers })

		const result = await core.sync(workspacePath, {
			branchName: "main",
			commitMessage: "",
			autoSync: false,
		})

		expect(result).toEqual({ success: true, pulledChanges: true })
		expect(
			gitExec.mock.calls.some(
				([args]) => Array.isArray(args) && args[0] === "commit",
			),
		).toBe(false)
	})

	it("updates .mdit/.gitignore with missing entries only", async () => {
		const workspacePath = "/workspace"
		const gitignorePath = "/workspace/.mdit/.gitignore"
		const { core, fileStore } = createCore({
			workspacePath,
			files: {
				[gitignorePath]: ".DS_Store\n/db.sqlite\n",
			},
		})

		await core.ensureGitignoreEntry(workspacePath)

		expect(fileStore.get(gitignorePath)).toBe(
			".DS_Store\n/db.sqlite\nworkspace.json",
		)
	})
})
