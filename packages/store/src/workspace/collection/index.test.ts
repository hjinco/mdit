import { describe, expect, it } from "vitest"
import { createStore } from "zustand/vanilla"
import {
	buildWorkspaceCollectionState,
	createWorkspaceCollectionActions,
} from "./index"

type EntryLike = {
	path: string
	name: string
	isDirectory: boolean
	children?: EntryLike[]
}

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

const createCollectionTestStore = () =>
	createStore<any>()((set, get) => ({
		...buildWorkspaceCollectionState(),
		entries: [],
		...createWorkspaceCollectionActions(set, get),
	}))

describe("workspace collection event handlers", () => {
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
	})

	it("onEntryRenamed rewrites descendant current and last paths", () => {
		const store = createCollectionTestStore()
		store.setState({
			currentCollectionPath: "/ws/old/child",
			lastCollectionPath: "/ws/old/other",
			entries: [makeDir("/ws/new", "new")],
		})

		store.getState().onEntryRenamed({
			sourcePath: "/ws/old",
			targetPath: "/ws/new",
			isDirectory: true,
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
			targetPath: "/ws/dest",
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
			sourcePath: "/ws/other",
			targetPath: "/ws/new-other",
			isDirectory: true,
		})

		expect(store.getState().currentCollectionPath).toBe("/ws/keep/current")
		expect(store.getState().lastCollectionPath).toBe("/ws/keep/last")
	})
})
