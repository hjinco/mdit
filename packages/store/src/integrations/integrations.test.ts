import { describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import type { MditStore } from ".."
import { prepareCollectionSlice } from "../collection/collection-slice"
import {
	prepareTabSlice,
	type TabSlice,
	type TabSliceDependencies,
} from "../tab/tab-slice"
import { registerCollectionIntegration } from "./register-collection-integration"
import { registerGitSyncWorkspaceIntegration } from "./register-git-sync-workspace-integration"
import { registerIndexingIntegration } from "./register-indexing-integration"
import { registerTabPathIntegration } from "./register-tab-path-integration"
import { createStoreEventHub } from "./store-events"

type EntryLike = {
	path: string
	name: string
	isDirectory: boolean
	children?: EntryLike[]
}

const makeFile = (path: string, name: string): EntryLike => ({
	path,
	name,
	isDirectory: false,
})

const makeDir = (
	path: string,
	name: string,
	children: EntryLike[] = [],
): EntryLike => ({
	path,
	name,
	isDirectory: true,
	children,
})

const createCollectionIntegrationStore = () => {
	const createSlice = prepareCollectionSlice()

	return createStore<any>()((set, get, api) => ({
		workspacePath: "/ws",
		entries: [],
		...createSlice(set, get, api),
	}))
}

type TabIntegrationState = TabSlice & {
	workspacePath: string | null
}

const createTabIntegrationStore = (
	overrides: Partial<TabSliceDependencies> = {},
) => {
	const readTextFile =
		overrides.readTextFile ?? vi.fn(async (path: string) => `content:${path}`)
	const renameFile = overrides.renameFile ?? vi.fn(async () => undefined)
	const saveSettings = overrides.saveSettings ?? vi.fn(async () => undefined)
	const createSlice = prepareTabSlice({
		readTextFile,
		renameFile,
		saveSettings,
	}) as any

	const store = createStore<TabIntegrationState>()((set, get, api) => ({
		workspacePath: "/ws",
		...createSlice(set, get, api),
	}))

	return {
		store,
		readTextFile,
	}
}

describe("store integrations", () => {
	it("refreshes collection entries when workspace entries are replaced", async () => {
		const events = createStoreEventHub()
		const store = createCollectionIntegrationStore()
		store.setState({
			currentCollectionPath: "/ws/folder",
			entries: [
				makeDir("/ws/folder", "folder", [
					makeFile("/ws/folder/note.md", "note.md"),
				]),
			],
		})

		registerCollectionIntegration(store as unknown as MditStore, events)
		await events.emit({
			type: "workspace/entries-replaced",
			workspacePath: "/ws",
		})

		expect(store.getState().collectionEntries).toEqual([
			makeFile("/ws/folder/note.md", "note.md"),
		])
	})

	it("refreshes collection entries when workspace creates an entry", async () => {
		const events = createStoreEventHub()
		const store = createCollectionIntegrationStore()
		store.setState({
			currentCollectionPath: "/ws/folder",
			entries: [
				makeDir("/ws/folder", "folder", [
					makeFile("/ws/folder/new.md", "new.md"),
				]),
			],
		})

		registerCollectionIntegration(store as unknown as MditStore, events)
		await events.emit({
			type: "workspace/entry-created",
			workspacePath: "/ws",
			parentPath: "/ws/folder",
			entry: makeFile("/ws/folder/new.md", "new.md"),
		})

		expect(store.getState().collectionEntries).toEqual([
			makeFile("/ws/folder/new.md", "new.md"),
		])
	})

	it("clears collection paths when deleted entries remove the active collection", async () => {
		const events = createStoreEventHub()
		const store = createCollectionIntegrationStore()
		store.setState({
			currentCollectionPath: "/ws/folder/child",
			lastCollectionPath: "/ws/folder/other",
			entries: [makeDir("/ws/another", "another")],
		})

		registerCollectionIntegration(store as unknown as MditStore, events)
		await events.emit({
			type: "workspace/entries-deleted",
			workspacePath: "/ws",
			paths: ["/ws/folder"],
		})

		expect(store.getState().currentCollectionPath).toBeNull()
		expect(store.getState().lastCollectionPath).toBeNull()
		expect(store.getState().collectionEntries).toEqual([])
	})

	it("rewrites collection paths when directories are renamed", async () => {
		const events = createStoreEventHub()
		const store = createCollectionIntegrationStore()
		store.setState({
			currentCollectionPath: "/ws/old/child",
			lastCollectionPath: "/ws/old/other",
			entries: [makeDir("/ws/new", "new")],
		})

		registerCollectionIntegration(store as unknown as MditStore, events)
		await events.emit({
			type: "workspace/entry-renamed",
			workspacePath: "/ws",
			oldPath: "/ws/old",
			newPath: "/ws/new",
			isDirectory: true,
			newName: "new",
		})

		expect(store.getState().currentCollectionPath).toBe("/ws/new/child")
		expect(store.getState().lastCollectionPath).toBe("/ws/new/other")
	})

	it("refreshes collection entries when files are renamed", async () => {
		const events = createStoreEventHub()
		const store = createCollectionIntegrationStore()
		store.setState({
			currentCollectionPath: "/ws/folder",
			entries: [
				makeDir("/ws/folder", "folder", [
					makeFile("/ws/folder/new.md", "new.md"),
				]),
			],
		})

		registerCollectionIntegration(store as unknown as MditStore, events)
		await events.emit({
			type: "workspace/entry-renamed",
			workspacePath: "/ws",
			oldPath: "/ws/folder/old.md",
			newPath: "/ws/folder/new.md",
			isDirectory: false,
			newName: "new.md",
		})

		expect(store.getState().collectionEntries).toEqual([
			makeFile("/ws/folder/new.md", "new.md"),
		])
	})

	it("rewrites collection paths when directories are moved", async () => {
		const events = createStoreEventHub()
		const store = createCollectionIntegrationStore()
		store.setState({
			currentCollectionPath: "/ws/src/child",
			lastCollectionPath: "/ws/src/other",
			entries: [makeDir("/ws/dest", "dest")],
		})

		registerCollectionIntegration(store as unknown as MditStore, events)
		await events.emit({
			type: "workspace/entry-moved",
			workspacePath: "/ws",
			sourcePath: "/ws/src",
			destinationDirPath: "/ws",
			newPath: "/ws/dest",
			isDirectory: true,
		})

		expect(store.getState().currentCollectionPath).toBe("/ws/dest/child")
		expect(store.getState().lastCollectionPath).toBe("/ws/dest/other")
	})

	it("ignores collection events for a different workspace", async () => {
		const events = createStoreEventHub()
		const store = createCollectionIntegrationStore()
		store.setState({
			workspacePath: "/other",
			currentCollectionPath: "/other/folder",
			entries: [makeDir("/other/folder", "folder")],
		})

		registerCollectionIntegration(store as unknown as MditStore, events)
		await events.emit({
			type: "workspace/entries-replaced",
			workspacePath: "/ws",
		})

		expect(store.getState().collectionEntries).toEqual([])
	})

	it("removes deleted paths from tab history", async () => {
		const events = createStoreEventHub()
		const { store } = createTabIntegrationStore()

		await store.getState().openTab("/ws/a.md")
		await store.getState().openTab("/ws/folder/note.md")
		await store.getState().openTab("/ws/keep.md")

		registerTabPathIntegration(store as unknown as MditStore, events)
		await events.emit({
			type: "workspace/tab-paths-removed",
			workspacePath: "/ws",
			paths: ["/ws/a.md", "/ws/folder"],
		})

		expect(store.getState().tabs.map((tab) => tab.path)).toEqual([
			"/ws/keep.md",
		])
		expect(store.getState().history.map((entry) => entry.path)).toEqual([
			"/ws/keep.md",
		])
		expect(store.getState().historyIndex).toBe(0)
	})

	it("renames open tabs and history paths when a tab path is renamed", async () => {
		const events = createStoreEventHub()
		const { store } = createTabIntegrationStore()

		await store.getState().openTab("/ws/old/note.md")

		registerTabPathIntegration(store as unknown as MditStore, events)
		await events.emit({
			type: "workspace/tab-path-renamed",
			workspacePath: "/ws",
			oldPath: "/ws/old",
			newPath: "/ws/new",
			clearSyncedName: true,
		})

		expect(store.getState().tabs.map((tab) => tab.path)).toEqual([
			"/ws/new/note.md",
		])
		expect(store.getState().history.map((entry) => entry.path)).toEqual([
			"/ws/new/note.md",
		])
	})

	it("moves open tabs and history paths when a tab path is moved", async () => {
		const events = createStoreEventHub()
		const { store, readTextFile } = createTabIntegrationStore()
		const readTextFileMock = vi.mocked(readTextFile)

		await store.getState().openTab("/ws/folder/note.md")
		readTextFileMock.mockClear()

		registerTabPathIntegration(store as unknown as MditStore, events)
		await events.emit({
			type: "workspace/tab-path-moved",
			workspacePath: "/ws",
			sourcePath: "/ws/folder",
			newPath: "/ws/archive/folder",
			refreshContent: true,
		})

		expect(store.getState().tabs.map((tab) => tab.path)).toEqual([
			"/ws/archive/folder/note.md",
		])
		expect(store.getState().history.map((entry) => entry.path)).toEqual([
			"/ws/archive/folder/note.md",
		])
		expect(readTextFileMock).not.toHaveBeenCalled()
	})

	it("ignores tab path events for a different workspace", async () => {
		const events = createStoreEventHub()
		const { store } = createTabIntegrationStore()

		await store.getState().openTab("/other/a.md")
		store.setState({ workspacePath: "/other" })

		registerTabPathIntegration(store as unknown as MditStore, events)
		await events.emit({
			type: "workspace/tab-path-renamed",
			workspacePath: "/ws",
			oldPath: "/other/a.md",
			newPath: "/other/b.md",
			clearSyncedName: false,
		})

		expect(store.getState().tabs.map((tab) => tab.path)).toEqual([
			"/other/a.md",
		])
		expect(store.getState().history.map((entry) => entry.path)).toEqual([
			"/other/a.md",
		])
	})

	it("resets indexing state when workspace resets", async () => {
		const events = createStoreEventHub()
		const state = {
			resetIndexingState: vi.fn(),
			getIndexingConfig: vi.fn(),
		}
		const store = {
			getState: () => state,
		} as unknown as MditStore

		registerIndexingIntegration(store, events)
		await events.emit({
			type: "workspace/reset",
			workspacePath: "/ws",
		})

		expect(state.resetIndexingState).toHaveBeenCalledTimes(1)
	})

	it("preloads indexing config when workspace loads", async () => {
		const events = createStoreEventHub()
		const getIndexingConfig = vi.fn().mockResolvedValue(null)
		const store = {
			getState: () => ({
				resetIndexingState: vi.fn(),
				getIndexingConfig,
			}),
		} as unknown as MditStore

		registerIndexingIntegration(store, events)
		await events.emit({
			type: "workspace/loaded",
			workspacePath: "/ws",
		})

		expect(getIndexingConfig).toHaveBeenCalledWith("/ws")
	})

	it("logs indexing preload failures without throwing", async () => {
		const events = createStoreEventHub()
		const preloadError = new Error("preload failed")
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		const store = {
			getState: () => ({
				resetIndexingState: vi.fn(),
				getIndexingConfig: vi.fn().mockRejectedValue(preloadError),
			}),
		} as unknown as MditStore

		registerIndexingIntegration(store, events)
		await events.emit({
			type: "workspace/loaded",
			workspacePath: "/ws",
		})

		expect(errorSpy).toHaveBeenCalledWith(
			"Failed to preload indexing config:",
			preloadError,
		)

		errorSpy.mockRestore()
	})

	it("refreshes the active workspace when sync pulled changes", async () => {
		const events = createStoreEventHub()
		const refreshWorkspaceEntries = vi.fn().mockResolvedValue(undefined)
		const store = {
			getState: () => ({
				workspacePath: "/ws",
				refreshWorkspaceEntries,
			}),
		} as unknown as MditStore

		registerGitSyncWorkspaceIntegration(store, events)
		await events.emit({
			type: "git-sync/pulled-changes",
			workspacePath: "/ws",
		})

		expect(refreshWorkspaceEntries).toHaveBeenCalledTimes(1)
	})

	it("propagates workspace refresh failures for sync pulled changes", async () => {
		const events = createStoreEventHub()
		const refreshError = new Error("refresh failed")
		const store = {
			getState: () => ({
				workspacePath: "/ws",
				refreshWorkspaceEntries: vi.fn().mockRejectedValue(refreshError),
			}),
		} as unknown as MditStore

		registerGitSyncWorkspaceIntegration(store, events)

		await expect(
			events.emit({
				type: "git-sync/pulled-changes",
				workspacePath: "/ws",
			}),
		).rejects.toThrow("refresh failed")
	})

	it("ignores sync refresh events for a different workspace", async () => {
		const events = createStoreEventHub()
		const refreshWorkspaceEntries = vi.fn().mockResolvedValue(undefined)
		const store = {
			getState: () => ({
				workspacePath: "/other",
				refreshWorkspaceEntries,
			}),
		} as unknown as MditStore

		registerGitSyncWorkspaceIntegration(store, events)
		await events.emit({
			type: "git-sync/pulled-changes",
			workspacePath: "/ws",
		})

		expect(refreshWorkspaceEntries).not.toHaveBeenCalled()
	})
})
