import {
	createLocalMutationJournal,
	DEFAULT_LOCAL_MUTATION_TTL_MS,
	type LocalMutationTarget,
} from "@mdit/local-fs-origin"
import { createState } from "../create-state"
import { createWorkspaceExplorerCommands } from "./explorer-commands"
import { createWorkspaceFileCommands } from "./file-commands"
import {
	readOpenedFileSettings,
	type WorkspaceSettingsRepository,
} from "./settings"
import { createWorkspaceTreeProjection } from "./tree-projection"
import type {
	FileSystemRepositoryLike,
	WorkspaceHistory,
	WorkspaceState,
} from "./types"
import { createWorkspaceWatchRuntime } from "./watch"
import type {
	WorkspaceWatchDependencies,
	WorkspaceWatcher,
} from "./watch-types"

type WorkspaceDocuments = WorkspaceWatchDependencies["documents"] & {
	getActiveTabPath(): string | null
	openTab(
		path: string,
		skipHistory?: boolean,
		force?: boolean,
		options?: { initialSelection?: "title" },
	): Promise<void>
	flushDocumentsUnderPaths(paths: string[]): Promise<boolean>
	closeAllTabs(): Promise<boolean>
	hydrateFromOpenedFiles(paths: string[]): Promise<boolean>
	reserveDocumentRename(oldPath: string, newPath: string): () => void
	renameTab(oldPath: string, newPath: string): Promise<void>
}

export type WorkspaceRuntimeDependencies = {
	fileSystem: FileSystemRepositoryLike
	readDocument: WorkspaceWatchDependencies["readDocument"]
	createDocument: (path: string, content: string) => Promise<boolean>
	settings: WorkspaceSettingsRepository
	history: WorkspaceHistory
	openFolder: (options: {
		multiple: false
		directory: true
		title: string
	}) => Promise<string | null>
	migrate: (workspacePath: string) => Promise<void>
	toast: {
		error: (
			message: string,
			options?: { description?: string; position?: "bottom-left" },
		) => unknown
	}
	documents: WorkspaceDocuments
	watcher: WorkspaceWatcher
	mode?: "workspace" | "detached"
}

const buildState = (
	sessionId: number,
	workspacePath: string | null,
	recentWorkspacePaths: string[],
): WorkspaceState => ({
	sessionId,
	workspacePath,
	recentWorkspacePaths,
	isLoading: false,
	isTreeLoading: !!workspacePath,
	entries: [],
	expandedDirectories: [],
	isMigrationsComplete: !workspacePath,
	pinnedDirectories: [],
	aiLockedEntryPaths: new Set(),
	selectedEntryPaths: new Set(),
	selectionAnchorPath: null,
	currentCollectionPath: null,
	lastCollectionPath: null,
})

export function createWorkspaceRuntime({
	fileSystem,
	readDocument,
	createDocument,
	settings,
	history,
	openFolder,
	migrate,
	toast,
	documents,
	watcher,
	mode = "workspace",
}: WorkspaceRuntimeDependencies) {
	const state = createState<WorkspaceState>({
		...buildState(0, null, []),
		isLoading: mode === "workspace",
	})
	const { getSnapshot } = state
	const originJournal = createLocalMutationJournal({
		defaultTtlMs: DEFAULT_LOCAL_MUTATION_TTL_MS,
	})
	let disposed = false
	let startup: Promise<void> | undefined
	let transition = Promise.resolve()

	const isCurrentSession = (sessionId: number) =>
		!disposed && getSnapshot().sessionId === sessionId

	const runTransition = (work: () => Promise<void>) => {
		const pending = transition.then(async () => {
			if (!disposed) {
				await work()
			}
		})
		transition = pending.catch(() => {})
		return pending
	}

	const registerLocalMutation = (
		targets: LocalMutationTarget[],
		options?: { ttlMs?: number },
	) => {
		const { workspacePath } = getSnapshot()
		if (workspacePath && targets.length > 0) {
			originJournal.register({ workspacePath, targets, ttlMs: options?.ttlMs })
		}
	}

	const {
		tree,
		syncEntries,
		persistDirectoryUi,
		reconcileSavedDocumentRename,
	} = createWorkspaceTreeProjection({
		state,
		fileSystem,
		settings,
		documents,
		isCurrentSession,
		registerLocalMutation,
	})
	const watchRuntime = createWorkspaceWatchRuntime({
		watcher,
		originJournal,
		fileSystem,
		readDocument,
		tree,
		documents,
	})

	const updateRecent = async () => {
		const recentWorkspacePaths = await history.listWorkspacePaths()
		if (!disposed) {
			state.update({ recentWorkspacePaths })
		}
	}

	const loadWorkspace = async (
		workspacePath: string | null,
		recentWorkspacePaths: string[],
		restoreTabs: boolean,
	) => {
		const sessionId = getSnapshot().sessionId + 1
		const stopping = watchRuntime.stop().catch((error) => {
			console.warn("Failed to stop workspace watcher:", error)
		})
		state.update(buildState(sessionId, workspacePath, recentWorkspacePaths))
		if (!workspacePath) {
			await stopping
			return
		}

		let finishOpening!: () => void
		const ready = new Promise<void>((resolve) => {
			finishOpening = resolve
		})
		try {
			try {
				await migrate(workspacePath)
				if (isCurrentSession(sessionId)) {
					state.update({ isMigrationsComplete: true })
				}
			} catch (error) {
				console.error("Workspace migrations failed:", error)
			}
			await stopping
			if (!isCurrentSession(sessionId)) {
				return
			}
			await watchRuntime
				.start({ workspacePath, sessionId, ready })
				.catch((error) => {
					console.warn("Failed to start workspace watcher:", error)
				})
			const [stored, entries] = await Promise.all([
				settings.loadSettings(workspacePath),
				tree.readWorkspaceEntriesFromPath(workspacePath),
			])
			if (!isCurrentSession(sessionId)) {
				return
			}
			await syncEntries(entries, stored)
			if (restoreTabs && isCurrentSession(sessionId)) {
				const paths = readOpenedFileSettings(
					workspacePath,
					stored.lastOpenedFilePaths,
				)
				const existing = await Promise.all(
					paths.map((path) => fileSystem.exists(path).catch(() => false)),
				)
				const restorable = paths.filter((_, index) => existing[index])
				if (restorable.length > 0 && isCurrentSession(sessionId)) {
					await documents.hydrateFromOpenedFiles(restorable)
				}
			}
		} finally {
			finishOpening()
			if (isCurrentSession(sessionId)) {
				state.update({ isTreeLoading: false })
			}
		}
	}

	const setWorkspace = (path: string) => {
		if (mode === "detached") {
			return Promise.resolve()
		}
		return runTransition(async () => {
			try {
				if (!(await fileSystem.isExistingDirectory(path))) {
					await history.removeWorkspace(path)
					await updateRecent()
					toast.error("Folder does not exist.", {
						description: path,
						position: "bottom-left",
					})
					return
				}
				if (!(await documents.closeAllTabs())) {
					toast.error("Save open notes before switching workspaces.")
					return
				}
				if (disposed) {
					return
				}

				const recent = [
					path,
					...getSnapshot().recentWorkspacePaths.filter(
						(recentPath) => recentPath !== path,
					),
				]
				await loadWorkspace(path, recent, false)
				if (!disposed) {
					await history.touchWorkspace(path)
					await updateRecent()
				}
			} catch (error) {
				console.error("Failed to set workspace:", error)
				toast.error("Failed to open workspace.")
			}
		})
	}

	const start = () => {
		if (mode === "detached") {
			return Promise.resolve()
		}
		startup ??= runTransition(async () => {
			try {
				const recent = await history.listWorkspacePaths()
				const available = await Promise.all(
					recent.map((path) =>
						fileSystem.isExistingDirectory(path).catch(() => false),
					),
				)
				const paths = recent.filter((_, index) => available[index])
				const missing = recent.filter((_, index) => !available[index])
				await Promise.allSettled(
					missing.map((path) => history.removeWorkspace(path)),
				)
				if (!disposed) {
					await loadWorkspace(paths[0] ?? null, paths, true)
				}
			} catch (error) {
				console.error("Failed to restore workspace:", error)
			} finally {
				if (!disposed) {
					state.update({ isLoading: false })
				}
			}
		})
		return startup
	}

	const explorerCommands = createWorkspaceExplorerCommands({
		state,
		getEntryByPath: tree.getEntryByPath,
		persistDirectoryUi,
	})
	const fileCommands = createWorkspaceFileCommands({
		fileSystem,
		createDocument,
		getSnapshot,
		isCurrentSession,
		tree,
		documents,
		registerLocalMutation,
		selectEntry: (path) =>
			explorerCommands.setEntrySelection({
				selectedIds: new Set([path]),
				anchorId: path,
			}),
	})

	return {
		getSnapshot,
		subscribe: state.subscribe,
		start,
		dispose: () => {
			disposed = true
			return watchRuntime.dispose()
		},
		commands: {
			...fileCommands,
			getEntryByPath: tree.getEntryByPath,
			refreshWorkspaceEntries: tree.refreshWorkspaceEntries,
			updateEntryModifiedDate: tree.updateEntryModifiedDate,
			registerLocalMutation,
			reconcileSavedDocumentRename,
			setWorkspace,
			openFolderPicker: async () => {
				const path = await openFolder({
					multiple: false,
					directory: true,
					title: "Select a folder",
				})
				if (path) {
					await setWorkspace(path)
				}
			},
			removeWorkspaceFromHistory: async (path: string) => {
				try {
					await history.removeWorkspace(path)
					await updateRecent()
				} catch (error) {
					console.error("Failed to remove workspace from history:", error)
				}
			},
			...explorerCommands,
		},
	}
}

export type WorkspaceRuntime = ReturnType<typeof createWorkspaceRuntime>
export type WorkspaceCommands = WorkspaceRuntime["commands"]
