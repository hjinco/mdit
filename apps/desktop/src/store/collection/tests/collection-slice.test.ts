import { describe, expect, it } from "vitest"
import { createStore } from "zustand/vanilla"
import { prepareCollectionSlice } from "../collection-slice"

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

const createCollectionTestStore = () => {
	const createSlice = prepareCollectionSlice()
	return createStore<any>()((set, get, api) => ({
		entries: [],
		...createSlice(set, get, api),
	}))
}

describe("collection-slice event handlers", () => {
	it("onEntryCreated switches collection path only for directories", () => {
		const store = createCollectionTestStore()
		store.setState({
			entries: [
				makeDir("/ws/folder", "folder", [
					makeFile("/ws/folder/a.md", "a.md"),
					makeFile("/ws/folder/b.txt", "b.txt"),
				]),
			],
		})

		store.getState().onEntryCreated({
			parentPath: "/ws",
			entry: makeDir("/ws/folder", "folder"),
		})

		expect(store.getState().currentCollectionPath).toBe("/ws/folder")
		expect(store.getState().lastCollectionPath).toBe("/ws/folder")
		expect(store.getState().collectionEntries).toEqual([
			makeFile("/ws/folder/a.md", "a.md"),
		])

		store.getState().onEntryCreated({
			parentPath: "/ws/folder",
			entry: makeFile("/ws/folder/new.md", "new.md"),
		})

		expect(store.getState().currentCollectionPath).toBe("/ws/folder")
		expect(store.getState().lastCollectionPath).toBe("/ws/folder")
	})

	it("onEntriesDeleted clears current and last paths when affected", () => {
		const store = createCollectionTestStore()
		store.setState({
			currentCollectionPath: "/ws/folder/child",
			lastCollectionPath: "/ws/folder/other",
			entries: [makeDir("/ws/another", "another")],
		})

		store.getState().onEntriesDeleted({ paths: ["/ws/folder"] })

		expect(store.getState().currentCollectionPath).toBeNull()
		expect(store.getState().lastCollectionPath).toBeNull()
		expect(store.getState().collectionEntries).toEqual([])
	})

	it("onEntryRenamed rewrites descendant current and last paths", () => {
		const store = createCollectionTestStore()
		store.setState({
			currentCollectionPath: "/ws/old/child",
			lastCollectionPath: "/ws/old/other",
			entries: [makeDir("/ws/new", "new")],
		})

		store.getState().onEntryRenamed({
			oldPath: "/ws/old",
			newPath: "/ws/new",
			isDirectory: true,
			newName: "new",
		})

		expect(store.getState().currentCollectionPath).toBe("/ws/new/child")
		expect(store.getState().lastCollectionPath).toBe("/ws/new/other")
	})

	it("onEntryMoved rewrites descendant current and last paths", () => {
		const store = createCollectionTestStore()
		store.setState({
			currentCollectionPath: "/ws/src/child",
			lastCollectionPath: "/ws/src/other",
			entries: [makeDir("/ws/dest", "dest")],
		})

		store.getState().onEntryMoved({
			sourcePath: "/ws/src",
			destinationDirPath: "/ws",
			newPath: "/ws/dest",
			isDirectory: true,
		})

		expect(store.getState().currentCollectionPath).toBe("/ws/dest/child")
		expect(store.getState().lastCollectionPath).toBe("/ws/dest/other")
	})

	it("keeps state unchanged when rename target is unrelated", () => {
		const store = createCollectionTestStore()
		store.setState({
			currentCollectionPath: "/ws/keep/current",
			lastCollectionPath: "/ws/keep/last",
			entries: [makeDir("/ws/keep", "keep")],
		})

		store.getState().onEntryRenamed({
			oldPath: "/ws/other",
			newPath: "/ws/new-other",
			isDirectory: true,
			newName: "new-other",
		})

		expect(store.getState().currentCollectionPath).toBe("/ws/keep/current")
		expect(store.getState().lastCollectionPath).toBe("/ws/keep/last")
	})
})
