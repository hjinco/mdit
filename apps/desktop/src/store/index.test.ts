import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/credentials", () => ({
	deleteCredential: vi.fn(),
	getCredential: vi.fn().mockResolvedValue(null),
	listCredentialProviders: vi.fn().mockResolvedValue([]),
	setApiKeyCredential: vi.fn(),
	setCodexCredential: vi.fn(),
}))

vi.mock("@/lib/frontmatter", () => ({
	removeFileFrontmatterProperty: vi.fn(),
	renameFileFrontmatterProperty: vi.fn(),
	updateFileFrontmatter: vi.fn(),
}))

vi.mock("@/lib/git-sync", () => ({
	createDesktopGitSyncCore: vi.fn(() => ({
		isGitRepository: vi.fn(),
		ensureGitignoreEntry: vi.fn(),
		detectSyncStatus: vi.fn(),
		sync: vi.fn(),
	})),
}))

vi.mock("@/lib/hotkeys-storage", () => ({
	createAppDataHotkeyStorage: vi.fn(() => ({
		load: vi.fn().mockResolvedValue(null),
		save: vi.fn().mockResolvedValue(undefined),
		reset: vi.fn().mockResolvedValue(undefined),
	})),
}))

vi.mock("@/lib/indexing", () => ({
	createTauriIndexingPort: vi.fn(() => ({
		getIndexingMeta: vi.fn().mockResolvedValue({ indexedDocCount: 0 }),
		getIndexingConfig: vi.fn().mockResolvedValue(null),
		setIndexingConfig: vi.fn().mockResolvedValue(undefined),
		indexVaultDocuments: vi.fn().mockResolvedValue({}),
		refreshWorkspaceEmbeddings: vi.fn().mockResolvedValue({}),
	})),
}))

vi.mock("@/lib/ollama", () => ({
	fetchOllamaModels: vi.fn().mockResolvedValue({
		completionModels: [],
		embeddingModels: [],
	}),
}))

vi.mock("@/lib/workspace-settings", () => ({
	loadSettings: vi.fn().mockResolvedValue({}),
	saveSettings: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/workspace-watch", () => ({
	createTauriWorkspaceWatcher: vi.fn(() => ({
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		subscribe: vi.fn().mockResolvedValue(vi.fn()),
	})),
}))

vi.mock("@/repositories/file-system-repository", () => ({
	FileSystemRepository: vi
		.fn()
		.mockImplementation(function FileSystemRepository() {
			return {
				exists: vi.fn().mockResolvedValue(false),
				isExistingDirectory: vi.fn().mockResolvedValue(false),
				mkdir: vi.fn().mockResolvedValue(undefined),
				readDir: vi.fn().mockResolvedValue([]),
				readTextFile: vi.fn().mockResolvedValue(""),
				rename: vi.fn().mockResolvedValue(undefined),
				writeTextFile: vi.fn().mockResolvedValue(undefined),
				moveToTrash: vi.fn().mockResolvedValue(undefined),
				moveManyToTrash: vi.fn().mockResolvedValue(undefined),
				copy: vi.fn().mockResolvedValue(undefined),
				stat: vi.fn().mockResolvedValue({ isDirectory: false }),
			}
		}),
}))

vi.mock("@/repositories/user-settings-repository", () => ({
	UserSettingsRepository: vi
		.fn()
		.mockImplementation(function UserSettingsRepository() {
			return {
				getFileExplorerOpen: vi.fn().mockReturnValue(true),
				setFileExplorerOpen: vi.fn((value: boolean) => value),
				getFontScale: vi.fn().mockReturnValue(1),
				setFontScale: vi.fn((value: number) => value),
				increaseFontScale: vi.fn((value: number) => value + 0.1),
				decreaseFontScale: vi.fn((value: number) => value - 0.1),
				resetFontScale: vi.fn().mockReturnValue(1),
				getLocalApiEnabled: vi.fn().mockReturnValue(false),
				setLocalApiEnabled: vi.fn((value: boolean) => value),
			}
		}),
}))

vi.mock("@/repositories/workspace-history-repository", () => ({
	WorkspaceHistoryRepository: vi
		.fn()
		.mockImplementation(function WorkspaceHistoryRepository() {
			return {
				listWorkspacePaths: vi.fn().mockResolvedValue([]),
				touchWorkspace: vi.fn().mockResolvedValue(undefined),
				removeWorkspace: vi.fn().mockResolvedValue(undefined),
			}
		}),
}))

vi.mock("@/repositories/workspace-settings-repository", () => ({
	WorkspaceSettingsRepository: vi
		.fn()
		.mockImplementation(function WorkspaceSettingsRepository() {
			return {
				loadSettings: vi.fn().mockResolvedValue({}),
				getPinnedDirectoriesFromSettings: vi.fn().mockReturnValue([]),
				getExpandedDirectoriesFromSettings: vi.fn().mockReturnValue([]),
				persistPinnedDirectories: vi.fn().mockResolvedValue(undefined),
				persistExpandedDirectories: vi.fn().mockResolvedValue(undefined),
			}
		}),
}))

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
	open: vi.fn().mockResolvedValue(null),
}))

vi.mock("@tauri-apps/plugin-fs", () => ({
	readTextFile: vi.fn().mockResolvedValue(""),
	rename: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@mdit/codex-oauth", () => ({
	isCodexCredentialExpiringSoon: vi.fn().mockReturnValue(false),
	refreshCodexAccessToken: vi.fn(),
	startCodexBrowserOAuth: vi.fn(),
}))

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}))

describe("desktop store bootstrap", () => {
	it("builds a singleton store with injected desktop adapters", async () => {
		const { useStore } = await import("./index")

		expect(useStore.getState().isFileExplorerOpen).toBe(true)
		expect(typeof useStore.getState().syncRecentWorkspacePaths).toBe("function")
		expect(typeof useStore.getState().loadWorkspace).toBe("function")
		expect(typeof useStore.getState().loadAISettings).toBe("function")
	})
})
