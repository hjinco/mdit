import type { StateCreator } from "zustand"
import {
	loadSettings as loadSettingsFromFile,
	saveSettings as saveSettingsToFile,
} from "@/lib/settings-utils"
import {
	GitService,
	type GitSyncStatus,
	type SyncConfig,
} from "@/services/git-service"
import type { WorkspaceSlice } from "../workspace/workspace-slice"

export type { SyncConfig } from "@/services/git-service"

export type GitSyncState = {
	isGitRepo: boolean
	status: GitSyncStatus
	lastUpdated: number | null
	error: string | null
	workspacePath: string | null
	autoSyncEnabled: boolean
}

export type GitSyncSlice = {
	// State
	gitSyncState: GitSyncState

	// Actions
	initGitSync: (workspacePath: string) => Promise<void>
	refreshGitStatus: () => Promise<void>
	performSync: () => Promise<void>
	getSyncConfig: (workspacePath: string | null) => Promise<SyncConfig>
	setBranchName: (workspacePath: string, branchName: string) => Promise<void>
	setCommitMessage: (
		workspacePath: string,
		commitMessage: string,
	) => Promise<void>
	setAutoSync: (workspacePath: string, autoSync: boolean) => Promise<void>
}

type GitSyncSliceDependencies = {
	loadSettings: typeof loadSettingsFromFile
	saveSettings: typeof saveSettingsToFile
}

const DEFAULT_CONFIG: SyncConfig = {
	branchName: "",
	commitMessage: "",
	autoSync: false,
}

const buildInitialGitSyncState = (): GitSyncState => ({
	isGitRepo: false,
	status: "synced",
	lastUpdated: null,
	error: null,
	workspacePath: null,
	autoSyncEnabled: false,
})

export const prepareGitSyncSlice =
	({
		loadSettings,
		saveSettings,
	}: GitSyncSliceDependencies): StateCreator<
		GitSyncSlice & WorkspaceSlice,
		[],
		[],
		GitSyncSlice
	> =>
	(set, get) => ({
		gitSyncState: buildInitialGitSyncState(),

		initGitSync: async (workspacePath: string) => {
			if (!workspacePath) {
				set({ gitSyncState: buildInitialGitSyncState() })
				return
			}

			try {
				const gitService = new GitService(workspacePath)
				const isRepo = await gitService.isGitRepository()

				if (!isRepo) {
					set({
						gitSyncState: {
							...buildInitialGitSyncState(),
							workspacePath,
						},
					})
					return
				}

				// Ensure .mdit/db.sqlite is in .gitignore
				await gitService.ensureGitignoreEntry()

				const status = await gitService.detectSyncStatus()
				const config = await get().getSyncConfig(workspacePath)

				set({
					gitSyncState: {
						isGitRepo: true,
						status,
						lastUpdated: Date.now(),
						error: null,
						workspacePath,
						autoSyncEnabled: config.autoSync,
					},
				})
			} catch (error) {
				console.error("Failed to initialize git sync:", error)
				const message =
					error instanceof Error ? error.message : String(error ?? "Unknown")
				set({
					gitSyncState: {
						...buildInitialGitSyncState(),
						workspacePath,
						status: "error",
						error: message,
					},
				})
			}
		},

		refreshGitStatus: async () => {
			const { workspacePath } = get().gitSyncState

			if (!workspacePath) {
				return
			}

			try {
				const gitService = new GitService(workspacePath)
				const isRepo = await gitService.isGitRepository()

				if (!isRepo) {
					set((state) => ({
						gitSyncState: {
							...state.gitSyncState,
							isGitRepo: false,
							status: "synced",
							lastUpdated: Date.now(),
							error: null,
						},
					}))
					return
				}

				const status = await gitService.detectSyncStatus()

				set((state) => ({
					// Don't overwrite 'error' or 'syncing' status
					gitSyncState:
						state.gitSyncState.status === "error" ||
						state.gitSyncState.status === "syncing"
							? state.gitSyncState
							: {
									...state.gitSyncState,
									isGitRepo: true,
									status,
									lastUpdated: Date.now(),
									error: null,
								},
				}))
			} catch (error) {
				console.error("Failed to refresh git status:", error)
				const message =
					error instanceof Error ? error.message : String(error ?? "Unknown")
				set((state) => ({
					gitSyncState: {
						...state.gitSyncState,
						status: "error",
						lastUpdated: Date.now(),
						error: message,
					},
				}))
			}
		},

		performSync: async () => {
			const { workspacePath, status } = get().gitSyncState

			if (!workspacePath || status === "syncing") {
				return
			}

			set((state) => ({
				gitSyncState: {
					...state.gitSyncState,
					status: "syncing",
					error: null,
				},
			}))

			try {
				const config = await get().getSyncConfig(workspacePath)
				const gitService = new GitService(workspacePath)
				const result = await gitService.sync(config)

				set((state) => ({
					gitSyncState: {
						...state.gitSyncState,
						status: "synced",
						lastUpdated: Date.now(),
						error: null,
					},
				}))

				// Refresh workspace entries if pull merged changes
				if (result.pulledChanges) {
					await get().refreshWorkspaceEntries()
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error ?? "Unknown")
				console.error("Failed to sync workspace:", error)
				set((state) => ({
					gitSyncState: {
						...state.gitSyncState,
						status: "error",
						error: message,
					},
				}))
			}
		},

		getSyncConfig: async (workspacePath: string | null) => {
			if (!workspacePath) {
				return DEFAULT_CONFIG
			}

			const settings = await loadSettings(workspacePath)
			const gitSync = settings.gitSync

			return {
				branchName: gitSync?.branchName ?? "",
				commitMessage: gitSync?.commitMessage ?? "",
				autoSync: gitSync?.autoSync ?? false,
			}
		},

		setBranchName: async (workspacePath: string, branchName: string) => {
			const settings = await loadSettings(workspacePath)
			const currentGitSync = settings.gitSync ?? {
				branchName: "",
				commitMessage: "",
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
				branchName: "",
				commitMessage: "",
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
				branchName: "",
				commitMessage: "",
				autoSync: false,
			}

			await saveSettings(workspacePath, {
				...settings,
				gitSync: {
					...currentGitSync,
					autoSync,
				},
			})

			if (get().gitSyncState.workspacePath !== workspacePath) {
				return
			}

			set((state) => ({
				gitSyncState: {
					...state.gitSyncState,
					autoSyncEnabled: autoSync,
				},
			}))
		},
	})

export const createGitSyncSlice = prepareGitSyncSlice({
	loadSettings: loadSettingsFromFile,
	saveSettings: saveSettingsToFile,
})
