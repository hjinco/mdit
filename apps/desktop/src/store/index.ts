import {
	isCodexCredentialExpiringSoon,
	refreshCodexAccessToken,
	startCodexBrowserOAuth,
} from "@mdit/codex-oauth"
import { createMditStore } from "@mdit/store"
import type {
	BacklinkEntry,
	FrontmatterUtils,
	ResolveWikiLinkResult,
} from "@mdit/store/core"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { readTextFile, rename as renameFile } from "@tauri-apps/plugin-fs"
import { toast } from "sonner"
import {
	deleteCredential,
	getCredential,
	listCredentialProviders,
	setApiKeyCredential,
	setCodexCredential,
} from "@/lib/credentials"
import {
	removeFileFrontmatterProperty,
	renameFileFrontmatterProperty,
	updateFileFrontmatter,
} from "@/lib/frontmatter"
import { createDesktopGitSyncCore } from "@/lib/git-sync"
import { createAppDataHotkeyStorage } from "@/lib/hotkeys-storage"
import { createTauriIndexingPort } from "@/lib/indexing"
import { fetchOllamaModels } from "@/lib/ollama"
import { loadSettings, saveSettings } from "@/lib/workspace-settings"
import { createTauriWorkspaceWatcher } from "@/lib/workspace-watch"
import { FileSystemRepository } from "@/repositories/file-system-repository"
import { UserSettingsRepository } from "@/repositories/user-settings-repository"
import { WorkspaceHistoryRepository } from "@/repositories/workspace-history-repository"
import { WorkspaceSettingsRepository } from "@/repositories/workspace-settings-repository"

export * from "@mdit/store/core"

const browserStorage =
	typeof globalThis.localStorage === "undefined"
		? {
				getItem: () => null,
				setItem: () => undefined,
				removeItem: () => undefined,
			}
		: globalThis.localStorage

const frontmatterUtils: FrontmatterUtils = {
	updateFileFrontmatter,
	renameFileFrontmatterProperty,
	removeFileFrontmatterProperty,
}

export const useStore = createMditStore({
	aiSettings: {
		storage: browserStorage,
		fetchOllamaModelCatalog: fetchOllamaModels,
		listCredentialProviders,
		getCredential,
		setApiKeyCredential,
		setCodexCredential,
		deleteCredential,
		startCodexBrowserOAuth,
		refreshCodexAccessToken,
		isCodexCredentialExpiringSoon,
	},
	gitSync: {
		loadSettings,
		saveSettings,
		createGitSyncCore: createDesktopGitSyncCore,
	},
	hotkeys: {
		storage: createAppDataHotkeyStorage(),
	},
	indexing: {
		createIndexingPort: createTauriIndexingPort,
	},
	tab: {
		readTextFile,
		renameFile,
		saveSettings,
	},
	ui: {
		preferences: new UserSettingsRepository(),
	},
	workspace: {
		fileSystemRepository: new FileSystemRepository(),
		settingsRepository: new WorkspaceSettingsRepository(),
		historyRepository: new WorkspaceHistoryRepository(),
		openDialog: async (options) => {
			const result = await open(options)
			return typeof result === "string" ? result : null
		},
		applyWorkspaceMigrations: (workspacePath: string) =>
			invoke<void>("apply_appdata_migrations", { workspacePath }),
		frontmatterUtils,
		toast,
		linkIndexing: {
			getBacklinks: (workspacePath: string, filePath: string) =>
				invoke<BacklinkEntry[]>("get_backlinks_command", {
					workspacePath,
					filePath,
				}),
			resolveWikiLink: ({
				workspacePath,
				currentNotePath,
				rawTarget,
			}: {
				workspacePath: string
				currentNotePath?: string | null
				rawTarget: string
			}) =>
				invoke<ResolveWikiLinkResult>("resolve_wiki_link_command", {
					workspacePath,
					currentNotePath,
					rawTarget,
				}),
			renameIndexedNote: (
				workspacePath: string,
				oldNotePath: string,
				newNotePath: string,
			) =>
				invoke<boolean>("rename_indexed_note_command", {
					workspacePath,
					oldNotePath,
					newNotePath,
				}),
			deleteIndexedNote: (workspacePath: string, notePath: string) =>
				invoke<boolean>("delete_indexed_note_command", {
					workspacePath,
					notePath,
				}),
		},
		watcher: createTauriWorkspaceWatcher(),
	},
})
