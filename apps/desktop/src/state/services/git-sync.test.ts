import { describe, expect, it, vi } from "vitest"
import {
	createGitSyncService,
	type GitSyncDependencies,
	type SyncConfig,
} from "./git-sync"

const deferred = <T>() => {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((done) => {
		resolve = done
	})
	return { promise, resolve }
}

const makeService = (overrides?: Partial<GitSyncDependencies>) => {
	const sync = vi.fn().mockResolvedValue({ pulledChanges: true })
	const refreshWorkspaceEntries = vi.fn().mockResolvedValue(undefined)
	const service = createGitSyncService({
		core: {
			isGitRepository: vi.fn().mockResolvedValue(true),
			getCurrentBranch: vi.fn().mockResolvedValue("main"),
			hasChangesToCommit: vi.fn().mockResolvedValue(false),
			getCurrentCommitHash: vi.fn().mockResolvedValue(null),
			ensureGitignoreEntry: vi.fn().mockResolvedValue(undefined),
			detectSyncStatus: vi.fn().mockResolvedValue("synced"),
			sync,
		},
		loadConfig: async () => ({
			autoSync: false,
			branchName: "",
			commitMessage: "",
		}),
		updateConfig: vi.fn().mockResolvedValue(undefined),
		refreshWorkspaceEntries,
		...overrides,
	})
	return { service, sync, refreshWorkspaceEntries }
}

describe("Git sync service", () => {
	it("refreshes the active workspace directly when sync pulls changes", async () => {
		const { service, sync, refreshWorkspaceEntries } = makeService()
		await service.commands.loadGitSyncState("/ws")
		await service.commands.performSync()
		expect(sync).toHaveBeenCalledTimes(1)
		expect(refreshWorkspaceEntries).toHaveBeenCalledWith("/ws")
	})

	it("waits for workspace refresh before resolving", async () => {
		const refresh = deferred<void>()
		const refreshWorkspaceEntries = vi.fn().mockReturnValue(refresh.promise)
		const { service } = makeService({ refreshWorkspaceEntries })
		await service.commands.loadGitSyncState("/ws")

		const sync = service.commands.performSync()
		await vi.waitFor(() =>
			expect(refreshWorkspaceEntries).toHaveBeenCalledTimes(1),
		)
		expect(service.getSnapshot().gitSyncState.status).toBe("syncing")
		refresh.resolve()
		await sync
		expect(service.getSnapshot().gitSyncState.status).toBe("synced")
	})

	it("sets an error state when the workspace refresh fails", async () => {
		const { service } = makeService({
			refreshWorkspaceEntries: vi
				.fn()
				.mockRejectedValue(new Error("refresh failed")),
		})
		await service.commands.loadGitSyncState("/ws")
		await service.commands.performSync()
		expect(service.getSnapshot().gitSyncState).toMatchObject({
			status: "error",
			error: "refresh failed",
		})
	})

	it("ignores a stale workspace bootstrap, including a reopen of the same path", async () => {
		const config = deferred<SyncConfig>()
		const loadConfig = vi
			.fn()
			.mockReturnValueOnce(config.promise)
			.mockResolvedValue({ autoSync: false, branchName: "", commitMessage: "" })
		const { service } = makeService({ loadConfig })
		const stale = service.commands.loadGitSyncState("/ws")
		await vi.waitFor(() => expect(loadConfig).toHaveBeenCalledTimes(1))
		await service.commands.loadGitSyncState(null)
		await service.commands.loadGitSyncState("/ws")
		config.resolve({ autoSync: true, branchName: "", commitMessage: "" })
		await stale

		expect(service.getSnapshot().gitSyncState.autoSyncEnabled).toBe(false)
	})

	it("removes scheduled checks and focus handlers when the workspace closes", async () => {
		const stop = vi.fn()
		const scheduler = {
			every: vi.fn().mockReturnValue(stop),
			onFocus: vi.fn().mockReturnValue(stop),
			hasFocus: () => true,
		}
		const { service } = makeService({ scheduler })
		await service.commands.loadGitSyncState("/ws")

		expect(scheduler.every).toHaveBeenCalledTimes(2)
		expect(scheduler.onFocus).toHaveBeenCalledTimes(1)
		await service.commands.loadGitSyncState(null)
		expect(stop).toHaveBeenCalledTimes(3)
	})
})
