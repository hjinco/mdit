import { describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import {
	prepareTabSlice,
	type TabHistorySelection,
	type TabSlice,
} from "./tab-slice"

type TestState = TabSlice & {
	workspacePath: string | null
}

const createSelection = (
	anchorPath: number[],
	anchorOffset: number,
	focusPath: number[] = anchorPath,
	focusOffset: number = anchorOffset,
): TabHistorySelection => ({
	anchor: {
		path: [...anchorPath],
		offset: anchorOffset,
	},
	focus: {
		path: [...focusPath],
		offset: focusOffset,
	},
})

function createTabStore() {
	const readTextFile = vi.fn(async (path: string) => `content:${path}`)
	const renameFile = vi.fn(async () => undefined)
	const saveSettings = vi.fn(async () => undefined)

	const createSlice = prepareTabSlice({
		readTextFile,
		renameFile,
		saveSettings,
	}) as any

	const store = createStore<TestState>()((set, get, api) => ({
		workspacePath: null,
		...createSlice(set, get, api),
	}))

	return {
		store,
		readTextFile,
		saveSettings,
	}
}

describe("tab-slice history selection", () => {
	it("stores the current tab selection when opening another tab", async () => {
		const { store } = createTabStore()
		let currentSelection: TabHistorySelection = null
		store.getState().setHistorySelectionProvider(() => currentSelection)

		await store.getState().openTab("/notes/a.md")

		const selectionInA = createSelection([2, 0], 4)
		currentSelection = selectionInA

		await store.getState().openTab("/notes/b.md")

		expect(store.getState().history).toEqual([
			{ path: "/notes/a.md", selection: selectionInA },
			{ path: "/notes/b.md", selection: null },
		])
		expect(store.getState().historyIndex).toBe(1)
	})

	it("captures current selection on goBack and queues restore for target entry", async () => {
		const { store } = createTabStore()
		let currentSelection: TabHistorySelection = null
		store.getState().setHistorySelectionProvider(() => currentSelection)

		await store.getState().openTab("/notes/a.md")
		const selectionInA = createSelection([0, 0], 3)
		currentSelection = selectionInA
		await store.getState().openTab("/notes/b.md")

		const selectionInB = createSelection([5, 1], 2)
		currentSelection = selectionInB

		const moved = await store.getState().goBack()
		expect(moved).toBe(true)

		expect(store.getState().getActiveTab()?.path).toBe("/notes/a.md")
		expect(store.getState().historyIndex).toBe(0)
		expect(store.getState().history).toEqual([
			{ path: "/notes/a.md", selection: selectionInA },
			{ path: "/notes/b.md", selection: selectionInB },
		])

		expect(
			store.getState().consumePendingHistorySelectionRestore("/notes/b.md"),
		).toEqual({ found: false })
		expect(
			store.getState().consumePendingHistorySelectionRestore("/notes/a.md"),
		).toEqual({ found: true, selection: selectionInA })
		expect(
			store.getState().consumePendingHistorySelectionRestore("/notes/a.md"),
		).toEqual({ found: false })
	})

	it("captures current selection on goForward and restores target entry selection", async () => {
		const { store } = createTabStore()
		let currentSelection: TabHistorySelection = null
		store.getState().setHistorySelectionProvider(() => currentSelection)

		await store.getState().openTab("/notes/a.md")
		const selectionInA = createSelection([1, 0], 1)
		currentSelection = selectionInA
		await store.getState().openTab("/notes/b.md")

		const selectionInB = createSelection([3, 0], 7)
		currentSelection = selectionInB
		await store.getState().goBack()
		expect(
			store.getState().consumePendingHistorySelectionRestore("/notes/a.md"),
		).toEqual({ found: true, selection: selectionInA })

		const selectionInAAfterBack = createSelection([4, 0], 5)
		currentSelection = selectionInAAfterBack
		const movedForward = await store.getState().goForward()

		expect(movedForward).toBe(true)
		expect(store.getState().history).toEqual([
			{ path: "/notes/a.md", selection: selectionInAAfterBack },
			{ path: "/notes/b.md", selection: selectionInB },
		])
		expect(
			store.getState().consumePendingHistorySelectionRestore("/notes/b.md"),
		).toEqual({ found: true, selection: selectionInB })
	})

	it("navigates history even when selection provider throws", async () => {
		const { store } = createTabStore()
		let currentSelection: TabHistorySelection = null
		let shouldThrow = false

		store.getState().setHistorySelectionProvider(() => {
			if (shouldThrow) {
				throw new Error("selection unavailable")
			}

			return currentSelection
		})

		await store.getState().openTab("/notes/a.md")
		const selectionInA = createSelection([2, 1], 6)
		currentSelection = selectionInA
		await store.getState().openTab("/notes/b.md")

		shouldThrow = true
		const movedBack = await store.getState().goBack()

		expect(movedBack).toBe(true)
		expect(store.getState().historyIndex).toBe(0)
		expect(store.getState().history).toEqual([
			{ path: "/notes/a.md", selection: selectionInA },
			{ path: "/notes/b.md", selection: null },
		])
		expect(
			store.getState().consumePendingHistorySelectionRestore("/notes/a.md"),
		).toEqual({ found: true, selection: selectionInA })
	})

	it("persists up to five recently opened file paths as relative paths", async () => {
		const { store, saveSettings } = createTabStore()
		store.setState({ workspacePath: "/workspace" })

		await store.getState().openTab("/workspace/1.md")
		await store.getState().openTab("/workspace/2.md")
		await store.getState().openTab("/workspace/3.md")
		await store.getState().openTab("/workspace/4.md")
		await store.getState().openTab("/workspace/5.md")
		await store.getState().openTab("/workspace/6.md")

		expect(saveSettings).toHaveBeenLastCalledWith("/workspace", {
			lastOpenedFilePaths: ["2.md", "3.md", "4.md", "5.md", "6.md"],
		})
	})

	it("does not persist opened file history without a workspace", async () => {
		const { store, saveSettings } = createTabStore()

		await store.getState().openTab("/notes/a.md")
		await store.getState().openTab("/notes/b.md")

		expect(saveSettings).not.toHaveBeenCalled()
	})

	it("hydrates history and sets the most recent file as active", async () => {
		const { store } = createTabStore()

		const hydrated = await store
			.getState()
			.hydrateFromOpenedFiles(["/notes/a.md", "/notes/b.md", "/notes/c.md"])

		expect(hydrated).toBe(true)
		expect(store.getState().history).toEqual([
			{ path: "/notes/a.md", selection: null },
			{ path: "/notes/b.md", selection: null },
			{ path: "/notes/c.md", selection: null },
		])
		expect(store.getState().historyIndex).toBe(2)
		expect(store.getState().getActiveTab()?.path).toBe("/notes/c.md")
		expect(store.getState().tabs.map((tab) => tab.path)).toEqual([
			"/notes/c.md",
		])
		expect(store.getState().activeTabId).toBe(
			store.getState().getActiveTab()?.id ?? null,
		)
	})

	it("refreshes the active tab from external content and queues selection restore", async () => {
		const { store } = createTabStore()
		const selectionInA = createSelection([2, 0], 4, [2, 0], 8)
		store.getState().setHistorySelectionProvider(() => selectionInA)

		await store.getState().openTab("/notes/a.md")

		const initialTabId = store.getState().getActiveTab()?.id
		store
			.getState()
			.refreshTabFromExternalContent("/notes/a.md", "external-content", {
				preserveSelection: true,
			})

		expect(store.getState().getActiveTab()).toEqual({
			id: expect.any(Number),
			path: "/notes/a.md",
			name: "a",
			content: "external-content",
		})
		expect(store.getState().getActiveTab()?.id).not.toBe(initialTabId)
		expect(store.getState().getIsSaved()).toBe(true)
		expect(store.getState().history).toEqual([
			{
				path: "/notes/a.md",
				selection: selectionInA,
			},
		])
		expect(
			store.getState().consumePendingHistorySelectionRestore("/notes/a.md"),
		).toEqual({ found: true, selection: selectionInA })
	})

	it("tracks saved state per active tab id", async () => {
		const { store } = createTabStore()

		await store.getState().openTab("/notes/a.md")
		const activeTabId = store.getState().getActiveTab()?.id
		expect(activeTabId).toBeTypeOf("number")
		store.getState().setTabSaved(activeTabId as number, false)
		expect(store.getState().getIsSaved()).toBe(false)
		expect(store.getState().tabSaveStates[activeTabId as number]).toBe(false)
		expect(store.getState().getOpenTabSnapshots()).toEqual([
			{ path: "/notes/a.md", isSaved: false },
		])
	})

	it("consumes external reload save skip tokens exactly once", async () => {
		const { store } = createTabStore()

		await store.getState().openTab("/notes/a.md")

		const initialTabId = store.getState().getActiveTab()?.id
		expect(initialTabId).toBeTypeOf("number")

		store
			.getState()
			.refreshTabFromExternalContent("/notes/a.md", "external-content")

		expect(
			store
				.getState()
				.consumePendingExternalReloadSaveSkip(initialTabId as number),
		).toBe(true)
		expect(
			store
				.getState()
				.consumePendingExternalReloadSaveSkip(initialTabId as number),
		).toBe(false)
		expect(
			store
				.getState()
				.consumePendingExternalReloadSaveSkip(
					store.getState().getActiveTab()!.id,
				),
		).toBe(false)
	})
})
