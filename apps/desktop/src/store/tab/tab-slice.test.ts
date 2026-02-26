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

		expect(store.getState().tab?.path).toBe("/notes/a.md")
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
})
