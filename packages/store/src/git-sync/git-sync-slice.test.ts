import { describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import { type GitSyncSlice, prepareGitSyncSlice } from "./git-sync-slice"

type GitSyncTestState = GitSyncSlice & {
	refreshWorkspaceEntries: () => Promise<void>
	workspacePath: string | null
}

describe("git-sync-slice", () => {
	it("refreshes the active workspace directly when sync pulls changes", async () => {
		const sync = vi.fn().mockResolvedValue({ pulledChanges: true })
		const refreshWorkspaceEntries = vi.fn().mockResolvedValue(undefined)
		const store = createStore<GitSyncTestState>()((set, get, api) => ({
			workspacePath: "/ws",
			refreshWorkspaceEntries,
			...prepareGitSyncSlice({
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
			})(set, get, api),
		}))

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
		expect(refreshWorkspaceEntries).toHaveBeenCalledTimes(1)
	})

	it("waits for workspace refresh before resolving", async () => {
		const sync = vi.fn().mockResolvedValue({ pulledChanges: true })
		let resolveRefresh!: () => void
		const refreshPromise = new Promise<void>((resolve) => {
			resolveRefresh = resolve
		})
		const store = createStore<GitSyncTestState>()((set, get, api) => ({
			workspacePath: "/ws",
			refreshWorkspaceEntries: vi.fn().mockReturnValue(refreshPromise),
			...prepareGitSyncSlice({
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
			})(set, get, api),
		}))

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

		resolveRefresh()
		await syncPromise

		expect(resolved).toBe(true)
	})

	it("sets an error state when the workspace refresh fails", async () => {
		const sync = vi.fn().mockResolvedValue({ pulledChanges: true })
		const store = createStore<GitSyncTestState>()((set, get, api) => ({
			workspacePath: "/ws",
			refreshWorkspaceEntries: vi
				.fn()
				.mockRejectedValue(new Error("refresh failed")),
			...prepareGitSyncSlice({
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
			})(set, get, api),
		}))

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
