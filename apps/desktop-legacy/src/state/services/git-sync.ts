import type { GitSyncCore, GitSyncStatus, SyncConfig } from "@mdit/git-sync"
import { createState } from "../create-state"
import type { ServiceScheduler } from "./scheduler"

export type { SyncConfig } from "@mdit/git-sync"

export type GitSyncState = {
	isGitRepo: boolean
	status: GitSyncStatus
	lastUpdated: number | null
	error: string | null
	workspacePath: string | null
	autoSyncEnabled: boolean
}

export type GitSyncSnapshot = { gitSyncState: GitSyncState }

export type GitSyncDependencies = {
	loadConfig: (workspacePath: string) => Promise<SyncConfig>
	updateConfig: (
		workspacePath: string,
		patch: Partial<SyncConfig>,
	) => Promise<void>
	core: GitSyncCore
	refreshWorkspaceEntries: (workspacePath: string) => Promise<void>
	scheduler?: ServiceScheduler
}

const STATUS_POLL_MS = 5_000
const AUTO_SYNC_MS = 60_000

const initialState = (workspacePath: string | null): GitSyncState => ({
	isGitRepo: false,
	status: "synced",
	lastUpdated: null,
	error: null,
	workspacePath,
	autoSyncEnabled: false,
})

type WorkspaceScope = {
	path: string
	refresh: Promise<void> | null
	stop: () => void
}

export function createGitSyncService({
	core,
	loadConfig,
	updateConfig,
	refreshWorkspaceEntries,
	scheduler,
}: GitSyncDependencies) {
	const state = createState<GitSyncSnapshot>({
		gitSyncState: initialState(null),
	})
	let workspace: WorkspaceScope | null = null
	const runningSyncs = new Map<string, Promise<void>>()

	const get = () => state.getSnapshot().gitSyncState
	const update = (patch: Partial<GitSyncState>) => {
		state.update({ gitSyncState: { ...get(), ...patch } })
	}

	const setError = (error: unknown) => {
		const message =
			error instanceof Error ? error.message : String(error ?? "Unknown")
		update({ status: "error", lastUpdated: Date.now(), error: message })
	}

	const refresh = async (scope: WorkspaceScope) => {
		try {
			const isGitRepo = await core.isGitRepository(scope.path)
			const status = isGitRepo
				? await core.detectSyncStatus(scope.path)
				: "synced"
			if (workspace !== scope || runningSyncs.has(scope.path)) {
				return
			}

			if (
				isGitRepo &&
				(get().status === "error" || get().status === "syncing")
			) {
				return
			}
			update({ isGitRepo, status, lastUpdated: Date.now(), error: null })
		} catch (error) {
			console.error("Failed to refresh git status:", error)
			if (workspace === scope && !runningSyncs.has(scope.path)) {
				setError(error)
			}
		} finally {
			scope.refresh = null
		}
	}

	const refreshGitStatus = () => {
		const scope = workspace
		if (!scope || runningSyncs.has(scope.path)) {
			return Promise.resolve()
		}
		scope.refresh ??= Promise.resolve().then(() => refresh(scope))
		return scope.refresh
	}

	const sync = async (scope: WorkspaceScope) => {
		try {
			const config = await loadConfig(scope.path)
			if (workspace !== scope) {
				return
			}
			const result = await core.sync(scope.path, config)
			if (result.pulledChanges && workspace?.path === scope.path) {
				await refreshWorkspaceEntries(scope.path)
			}
			if (workspace === scope) {
				update({ status: "synced", lastUpdated: Date.now(), error: null })
			}
		} catch (error) {
			console.error("Failed to sync workspace:", error)
			if (workspace === scope) {
				setError(error)
			}
		}
	}

	const performSync = () => {
		const scope = workspace
		if (!scope) {
			return Promise.resolve()
		}
		const running = runningSyncs.get(scope.path)
		if (running) {
			return running
		}
		const operation = Promise.resolve()
			.then(() => sync(scope))
			.finally(() => runningSyncs.delete(scope.path))
		runningSyncs.set(scope.path, operation)
		update({ status: "syncing", error: null })
		return operation
	}

	const startBackgroundChecks = (scope: WorkspaceScope) => {
		if (!scheduler) {
			return
		}

		const poll = () => {
			if (workspace === scope && get().isGitRepo && scheduler.hasFocus()) {
				void refreshGitStatus()
			}
		}
		const stopPolling = scheduler.every(STATUS_POLL_MS, poll)
		const stopFocus = scheduler.onFocus(() => {
			if (workspace === scope && get().isGitRepo) {
				void refreshGitStatus()
			}
		})
		const stopAutoSync = scheduler.every(AUTO_SYNC_MS, () => {
			const current = get()
			if (
				workspace === scope &&
				current.isGitRepo &&
				current.autoSyncEnabled &&
				current.status === "unsynced" &&
				scheduler.hasFocus()
			) {
				void performSync()
			}
		})
		scope.stop = () => {
			stopPolling()
			stopFocus()
			stopAutoSync()
		}
	}

	const loadGitSyncState = async (path: string | null) => {
		workspace?.stop()
		workspace = path ? { path, refresh: null, stop: () => {} } : null
		const scope = workspace
		state.update({ gitSyncState: initialState(path) })
		if (!scope) {
			return
		}
		try {
			const isGitRepo = await core.isGitRepository(scope.path)
			if (workspace !== scope || !isGitRepo) {
				return
			}
			await core.ensureGitignoreEntry(scope.path)
			const [status, config] = await Promise.all([
				core.detectSyncStatus(scope.path),
				loadConfig(scope.path),
			])
			if (workspace === scope) {
				update({
					isGitRepo: true,
					status,
					lastUpdated: Date.now(),
					error: null,
					autoSyncEnabled: config.autoSync,
				})
				startBackgroundChecks(scope)
			}
		} catch (error) {
			console.error("Failed to load git sync state:", error)
			if (workspace === scope) {
				setError(error)
			}
		}
	}

	const getSyncConfig = (workspacePath: string | null): Promise<SyncConfig> =>
		workspacePath
			? loadConfig(workspacePath)
			: Promise.resolve({ branchName: "", commitMessage: "", autoSync: false })

	const setAutoSync = async (workspacePath: string, autoSync: boolean) => {
		await updateConfig(workspacePath, { autoSync })
		if (workspace?.path === workspacePath) {
			update({ autoSyncEnabled: autoSync })
		}
	}

	return {
		getSnapshot: state.getSnapshot,
		subscribe: state.subscribe,
		commands: {
			loadGitSyncState,
			refreshGitStatus,
			performSync,
			getSyncConfig,
			setBranchName: (path: string, branchName: string) =>
				updateConfig(path, { branchName }),
			setCommitMessage: (path: string, commitMessage: string) =>
				updateConfig(path, { commitMessage }),
			setAutoSync,
		},
	}
}
