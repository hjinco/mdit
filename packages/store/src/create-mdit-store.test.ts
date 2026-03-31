import { describe, expect, it, vi } from "vitest"
import { createMditStore } from "."
import type { BrowserStorageLike } from "./browser-storage"

function createMemoryStorage(): BrowserStorageLike {
	const values = new Map<string, string>()

	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => {
			values.set(key, String(value))
		},
		removeItem: (key) => {
			values.delete(key)
		},
	}
}

describe("createMditStore", () => {
	it("composes the full store from injected dependencies", async () => {
		const store = createMditStore({
			aiSettings: {
				storage: createMemoryStorage(),
				fetchOllamaModelCatalog: vi.fn().mockResolvedValue({
					completionModels: [],
					embeddingModels: [],
				}),
				listCredentialProviders: vi.fn().mockResolvedValue([]),
				getCredential: vi.fn().mockResolvedValue(null),
				setApiKeyCredential: vi.fn().mockResolvedValue(undefined),
				setCodexCredential: vi.fn().mockResolvedValue(undefined),
				deleteCredential: vi.fn().mockResolvedValue(undefined),
				startCodexBrowserOAuth: vi.fn().mockResolvedValue({
					accessToken: "token",
					refreshToken: "refresh",
					expiresAt: Date.now() + 1000,
				}),
				refreshCodexAccessToken: vi.fn().mockResolvedValue({
					accessToken: "token",
					refreshToken: "refresh",
					expiresAt: Date.now() + 1000,
				}),
				isCodexCredentialExpiringSoon: vi.fn().mockReturnValue(false),
			},
			gitSync: {
				loadSettings: vi.fn().mockResolvedValue({}),
				saveSettings: vi.fn().mockResolvedValue(undefined),
				createGitSyncCore: () => ({
					isGitRepository: vi.fn().mockResolvedValue(false),
					getCurrentBranch: vi.fn().mockResolvedValue("main"),
					hasChangesToCommit: vi.fn().mockResolvedValue(false),
					getCurrentCommitHash: vi.fn().mockResolvedValue(null),
					ensureGitignoreEntry: vi.fn().mockResolvedValue(undefined),
					detectSyncStatus: vi.fn().mockResolvedValue("synced"),
					sync: vi.fn().mockResolvedValue({ pulledChanges: false }),
				}),
			},
			hotkeys: {
				storage: {
					load: vi.fn().mockResolvedValue(null),
					save: vi.fn().mockResolvedValue(undefined),
					reset: vi.fn().mockResolvedValue(undefined),
				},
			},
			indexing: {
				createIndexingPort: () => ({
					getIndexingMeta: vi.fn().mockResolvedValue({ indexedDocCount: 0 }),
					getIndexingConfig: vi.fn().mockResolvedValue(null),
					setIndexingConfig: vi.fn().mockResolvedValue(undefined),
					indexVaultDocuments: vi.fn().mockResolvedValue({}),
					refreshWorkspaceEmbeddings: vi.fn().mockResolvedValue({}),
				}),
			},
			tab: {
				readTextFile: vi.fn().mockResolvedValue(""),
				renameFile: vi.fn().mockResolvedValue(undefined),
				saveSettings: vi.fn().mockResolvedValue(undefined),
			},
			ui: {
				preferences: {
					getFileExplorerOpen: () => true,
					setFileExplorerOpen: (isOpen) => isOpen,
					getFontScale: () => 1,
					setFontScale: (value) => value,
					increaseFontScale: (current) => current + 0.1,
					decreaseFontScale: (current) => current - 0.1,
					resetFontScale: () => 1,
					getLocalApiEnabled: () => false,
					setLocalApiEnabled: (enabled) => enabled,
				},
			},
			workspace: {
				fileSystemRepository: {
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
				},
				settingsRepository: {
					loadSettings: vi.fn().mockResolvedValue({}),
					getPinnedDirectoriesFromSettings: vi.fn().mockReturnValue([]),
					getExpandedDirectoriesFromSettings: vi.fn().mockReturnValue([]),
					persistPinnedDirectories: vi.fn().mockResolvedValue(undefined),
					persistExpandedDirectories: vi.fn().mockResolvedValue(undefined),
				},
				historyRepository: {
					listWorkspacePaths: vi.fn().mockResolvedValue([]),
					touchWorkspace: vi.fn().mockResolvedValue(undefined),
					removeWorkspace: vi.fn().mockResolvedValue(undefined),
				},
				openDialog: vi.fn().mockResolvedValue(null),
				applyWorkspaceMigrations: vi.fn().mockResolvedValue(undefined),
				frontmatterUtils: {
					updateFileFrontmatter: vi.fn().mockResolvedValue(undefined),
					renameFileFrontmatterProperty: vi.fn().mockResolvedValue(undefined),
					removeFileFrontmatterProperty: vi.fn().mockResolvedValue(undefined),
				},
				toast: {
					success: vi.fn(),
					error: vi.fn(),
				},
				linkIndexing: {
					getBacklinks: vi.fn().mockResolvedValue([]),
					resolveWikiLink: vi.fn().mockResolvedValue({
						canonicalTarget: "",
						resolvedRelPath: null,
						matchCount: 0,
						disambiguated: false,
						unresolved: true,
					}),
					renameIndexedNote: vi.fn().mockResolvedValue(false),
					deleteIndexedNote: vi.fn().mockResolvedValue(false),
				},
				watcher: {
					start: vi.fn().mockResolvedValue(undefined),
					stop: vi.fn().mockResolvedValue(undefined),
					subscribe: vi.fn().mockResolvedValue(vi.fn()),
				},
			},
		})

		expect(store.getState().isFileExplorerOpen).toBe(true)
		expect(store.getState().fontScale).toBe(1)

		await store.getState().loadHotkeys()
		expect(store.getState().isHotkeysLoaded).toBe(true)

		await store.getState().loadAISettings()
		expect(store.getState().connectedProviders).toEqual([])
	})
})
