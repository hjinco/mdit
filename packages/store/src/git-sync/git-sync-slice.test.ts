import { describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import { type GitSyncSlice, prepareGitSyncSlice } from "./git-sync-slice"

describe("git-sync-slice", () => {
	it("emits a pulled-changes event instead of refreshing the workspace directly", async () => {
		const sync = vi.fn().mockResolvedValue({ pulledChanges: true })
		const events = {
			emit: vi.fn().mockResolvedValue(undefined),
			subscribe: vi.fn(),
		}
		const store = createStore<GitSyncSlice>()((set, get, api) =>
			prepareGitSyncSlice(
				{
					loadSettings: vi.fn().mockResolvedValue({}),
					saveSettings: vi.fn().mockResolvedValue(undefined),
					createGitSyncCore: () => ({
						isGitRepository: vi.fn().mockResolvedValue(true),
						getCurrentBranch: vi.fn().mockResolvedValue("main"),
						hasChangesToCommit: vi.fn().mockResolvedValue(false),
						getCurrentCommitHash: vi.fn().mockResolvedValue(null),
						ensureGitignoreEntry: vi.fn().mockResolvedValue(undefined),
						detectSyncStatus: vi.fn().mockResolvedValue("synced"),
						sync,
					}),
				},
				{ events: events as any },
			)(set, get, api),
		)

		store.setState((state) => ({
			...state,
			gitSyncState: {
				...state.gitSyncState,
				workspacePath: "/ws",
				isGitRepo: true,
				status: "unsynced",
			},
		}))

		await store.getState().performSync()

		expect(sync).toHaveBeenCalledTimes(1)
		expect(events.emit).toHaveBeenCalledWith({
			type: "git-sync/pulled-changes",
			workspacePath: "/ws",
		})
	})

	it("waits for the pulled-changes event handlers before resolving", async () => {
		const sync = vi.fn().mockResolvedValue({ pulledChanges: true })
		let resolveEmit!: () => void
		const emitPromise = new Promise<void>((resolve) => {
			resolveEmit = resolve
		})
		const events = {
			emit: vi.fn().mockReturnValue(emitPromise),
			subscribe: vi.fn(),
		}
		const store = createStore<GitSyncSlice>()((set, get, api) =>
			prepareGitSyncSlice(
				{
					loadSettings: vi.fn().mockResolvedValue({}),
					saveSettings: vi.fn().mockResolvedValue(undefined),
					createGitSyncCore: () => ({
						isGitRepository: vi.fn().mockResolvedValue(true),
						getCurrentBranch: vi.fn().mockResolvedValue("main"),
						hasChangesToCommit: vi.fn().mockResolvedValue(false),
						getCurrentCommitHash: vi.fn().mockResolvedValue(null),
						ensureGitignoreEntry: vi.fn().mockResolvedValue(undefined),
						detectSyncStatus: vi.fn().mockResolvedValue("synced"),
						sync,
					}),
				},
				{ events: events as any },
			)(set, get, api),
		)

		store.setState((state) => ({
			...state,
			gitSyncState: {
				...state.gitSyncState,
				workspacePath: "/ws",
				isGitRepo: true,
				status: "unsynced",
			},
		}))

		let resolved = false
		const syncPromise = store
			.getState()
			.performSync()
			.then(() => {
				resolved = true
			})

		await Promise.resolve()
		expect(resolved).toBe(false)

		resolveEmit()
		await syncPromise

		expect(resolved).toBe(true)
	})

	it("sets an error state when the pulled-changes refresh fails", async () => {
		const sync = vi.fn().mockResolvedValue({ pulledChanges: true })
		const events = {
			emit: vi.fn().mockRejectedValue(new Error("refresh failed")),
			subscribe: vi.fn(),
		}
		const store = createStore<GitSyncSlice>()((set, get, api) =>
			prepareGitSyncSlice(
				{
					loadSettings: vi.fn().mockResolvedValue({}),
					saveSettings: vi.fn().mockResolvedValue(undefined),
					createGitSyncCore: () => ({
						isGitRepository: vi.fn().mockResolvedValue(true),
						getCurrentBranch: vi.fn().mockResolvedValue("main"),
						hasChangesToCommit: vi.fn().mockResolvedValue(false),
						getCurrentCommitHash: vi.fn().mockResolvedValue(null),
						ensureGitignoreEntry: vi.fn().mockResolvedValue(undefined),
						detectSyncStatus: vi.fn().mockResolvedValue("synced"),
						sync,
					}),
				},
				{ events: events as any },
			)(set, get, api),
		)

		store.setState((state) => ({
			...state,
			gitSyncState: {
				...state.gitSyncState,
				workspacePath: "/ws",
				isGitRepo: true,
				status: "unsynced",
			},
		}))

		await store.getState().performSync()

		expect(store.getState().gitSyncState.status).toBe("error")
		expect(store.getState().gitSyncState.error).toBe("refresh failed")
	})
})
