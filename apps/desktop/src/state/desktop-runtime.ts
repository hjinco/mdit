import {
	isCodexCredentialExpiringSoon,
	refreshCodexAccessToken,
	startCodexBrowserOAuth,
} from "@mdit/codex-oauth"
import { hasPathConflictWithLockedPaths } from "@mdit/utils/path-utils"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { emitTo } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { open } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import {
	deleteCredential,
	getCredential,
	listCredentialProviders,
	setApiKeyCredential,
	setCodexCredential,
} from "@/lib/credentials"
import { createDesktopGitSyncCore } from "@/lib/git-sync"
import { createAppDataHotkeyStorage } from "@/lib/hotkeys-storage"
import { createTauriIndexingPort } from "@/lib/indexing"
import { fetchOllamaModels } from "@/lib/ollama"
import { FileSystemRepository } from "@/repositories/file-system-repository"
import { UserSettingsRepository } from "@/repositories/user-settings-repository"
import { WorkspaceHistoryRepository } from "@/repositories/workspace-history-repository"
import { createDocumentWorkspace } from "./documents/document-state"
import { nativeDocumentFiles } from "./documents/native-files"
import { createAISettingsService } from "./services/ai-settings"
import { createGitSyncService } from "./services/git-sync"
import { createHotkeysService } from "./services/hotkeys"
import { createIndexingService } from "./services/indexing"
import { createBrowserServiceScheduler } from "./services/scheduler"
import { createWindowState } from "./window"
import {
	createWorkspaceRuntime,
	createWorkspaceSettingsRepository,
} from "./workspace"
import { createTauriWorkspaceWatcher } from "./workspace/watch-tauri"

const OPEN_WORKSPACE_PICKER = "open-workspace-picker"

export function createDesktopRuntime(mode: "workspace" | "detached") {
	const preferences = createWindowState(new UserSettingsRepository(), mode)
	const fileSystem = new FileSystemRepository()
	const settings = createWorkspaceSettingsRepository(fileSystem)
	const scheduler = createBrowserServiceScheduler(window, document)
	const indexing = createIndexingService({
		createIndexingPort: createTauriIndexingPort,
		scheduler,
	})
	const aiSettings = createAISettingsService({
		storage: localStorage,
		fetchOllamaModelCatalog: fetchOllamaModels,
		listCredentialProviders,
		getCredential,
		setApiKeyCredential,
		setCodexCredential,
		deleteCredential,
		startCodexBrowserOAuth,
		refreshCodexAccessToken,
		isCodexCredentialExpiringSoon,
	})
	const hotkeys = createHotkeysService({
		storage: createAppDataHotkeyStorage(),
	})
	const documents = createDocumentWorkspace({
		...nativeDocumentFiles,
		getWorkspacePath: (): string | null =>
			workspace.getSnapshot().workspacePath,
		saveLastOpenedFiles: (path, lastOpenedFilePaths) =>
			settings.saveSettings(path, { lastOpenedFilePaths }),
		reportSaveError: (error) =>
			toast.error(error instanceof Error ? error.message : String(error)),
		isRenameBlocked: (oldPath, newPath) =>
			hasPathConflictWithLockedPaths(
				[oldPath, newPath],
				[...workspace.getSnapshot().aiLockedEntryPaths],
			),
		onSaved: (path) => {
			workspace.commands.registerLocalMutation([{ path, scope: "exact" }])
		},
		onRenamed: (from, to) =>
			workspace.commands.reconcileSavedDocumentRename(from, to),
	})
	const workspace = createWorkspaceRuntime({
		fileSystem,
		settings,
		history: new WorkspaceHistoryRepository(),
		openFolder: async (options) => {
			if (mode === "detached") {
				await emitTo("main", OPEN_WORKSPACE_PICKER)
				return null
			}
			const path = await open(options)
			return typeof path === "string" ? path : null
		},
		migrate: (workspacePath) =>
			invoke<void>("apply_appdata_migrations", { workspacePath }),
		toast,
		documents: documents.commands,
		readDocument: nativeDocumentFiles.readDocument,
		createDocument: async (path, content) => {
			const result = await nativeDocumentFiles.writeDocument({
				path,
				content,
				expectedRevision: null,
			})
			return result.status === "saved"
		},
		watcher: createTauriWorkspaceWatcher(),
		mode,
	})
	const gitSync = createGitSyncService({
		loadConfig: async (path) => {
			const { gitSync } = await settings.loadSettings(path)
			return {
				branchName: gitSync?.branchName ?? "",
				commitMessage: gitSync?.commitMessage ?? "",
				autoSync: gitSync?.autoSync ?? false,
			}
		},
		updateConfig: (path, gitSync) => settings.saveSettings(path, { gitSync }),
		core: createDesktopGitSyncCore(),
		refreshWorkspaceEntries: async (path) => {
			if (workspace.getSnapshot().workspacePath === path) {
				await workspace.commands.refreshWorkspaceEntries()
			}
		},
		scheduler,
	})

	let started = false
	let stopServices: (() => void) | undefined
	let stopAutosave: (() => void) | undefined
	let unlistenOpenWorkspace: Promise<(() => void) | undefined> | undefined

	function start() {
		if (started) return
		started = true
		void aiSettings.commands.loadAISettings()
		void hotkeys.commands.loadHotkeys()
		void aiSettings.commands.fetchOllamaModels()
		stopAutosave = scheduler.every(10_000, () => {
			for (const document of documents.getSnapshot().openDocuments) {
				if (!document.isSaved && !document.conflict) {
					void documents.commands.requestDocumentSave(document.id)
				}
			}
		})

		if (mode === "workspace") {
			if (isTauri()) {
				unlistenOpenWorkspace = getCurrentWindow()
					.listen(OPEN_WORKSPACE_PICKER, () => {
						void invoke("show_main_window")
							.then(workspace.commands.openFolderPicker)
							.catch((error) => {
								console.error("Failed to open workspace picker:", error)
								toast.error("Failed to open the workspace picker.")
							})
					})
					.catch((error) => {
						console.error("Failed to register workspace picker:", error)
						return undefined
					})
			}
			let lastSessionId: number | undefined
			let indexStarted = false
			stopServices = workspace.subscribe(() => {
				const { sessionId, workspacePath, isMigrationsComplete } =
					workspace.getSnapshot()
				if (lastSessionId !== sessionId) {
					lastSessionId = sessionId
					indexStarted = false
					indexing.commands.setWorkspace(workspacePath)
					void gitSync.commands.loadGitSyncState(workspacePath)
				}
				if (workspacePath && isMigrationsComplete && !indexStarted) {
					indexStarted = true
					indexing.commands.startAutoIndexing(workspacePath)
				}
			})
			void workspace.start().catch(console.error)
		}
	}

	async function dispose() {
		stopServices?.()
		stopAutosave?.()
		indexing.commands.setWorkspace(null)
		await Promise.all([
			unlistenOpenWorkspace?.then((unlisten) => unlisten?.()),
			workspace.dispose(),
			gitSync.commands.loadGitSyncState(null),
		])
	}

	return {
		workspace,
		documents,
		window: preferences,
		aiSettings,
		hotkeys,
		indexing,
		gitSync,
		start,
		dispose,
	}
}

export type DesktopRuntime = ReturnType<typeof createDesktopRuntime>

let windowRuntime: DesktopRuntime | undefined

export function getDesktopRuntime(): DesktopRuntime {
	if (!windowRuntime) {
		const path = window.location.hash.slice(1) || window.location.pathname
		const route = path.split("?")[0]
		const detached = isTauri()
			? getCurrentWindow().label !== "main"
			: route === "/edit" || route === "/quick-note"
		windowRuntime = createDesktopRuntime(detached ? "detached" : "workspace")
	}
	return windowRuntime
}

import.meta.hot?.dispose(() => {
	void windowRuntime?.dispose()
	windowRuntime = undefined
})
