import { describe, expect, it, vi } from "vitest"
import { createDocumentWorkspace } from "./document-state"
import {
	selectActiveDocumentId,
	selectActiveTab,
	selectIsSaved,
	selectResolvedTabs,
} from "./selectors"
import type {
	DiskDocument,
	DocumentWorkspaceDependencies,
	DocumentWriteResult,
	TabHistorySelection,
} from "./types"

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

type DeferredPromise<T> = {
	promise: Promise<T>
	resolve: (value: T | PromiseLike<T>) => void
	reject: (reason?: unknown) => void
}

const createDeferredPromise = <T>(): DeferredPromise<T> => {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve
		reject = nextReject
	})

	return { promise, resolve, reject }
}

const flushMicrotasks = async () => {
	await Promise.resolve()
	await Promise.resolve()
}

const waitForAssertion = async (assertion: () => void) => {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		try {
			assertion()
			return
		} catch (error) {
			if (attempt === 9) {
				throw error
			}
			await flushMicrotasks()
		}
	}
}

function createTestDocuments(
	overrides: Partial<DocumentWorkspaceDependencies> = {},
) {
	let workspacePath: string | null = null
	const readDocument =
		overrides.readDocument ??
		vi.fn(async (path: string) => ({
			content: `content:${path}`,
			revision: `initial:${path}`,
		}))
	const writeDocument =
		overrides.writeDocument ??
		vi.fn<DocumentWorkspaceDependencies["writeDocument"]>().mockResolvedValue({
			status: "saved",
			revision: "written",
		})
	const renameDocument =
		overrides.renameDocument ??
		vi.fn<DocumentWorkspaceDependencies["renameDocument"]>().mockResolvedValue({
			status: "renamed",
			revision: "renamed",
		})
	const saveLastOpenedFiles =
		overrides.saveLastOpenedFiles ?? vi.fn(async () => {})
	const reportSaveError = overrides.reportSaveError ?? vi.fn()

	const workspace = createDocumentWorkspace({
		readDocument,
		writeDocument,
		renameDocument,
		saveLastOpenedFiles,
		reportSaveError,
		getWorkspacePath: () => workspacePath,
		...overrides,
	})

	return {
		workspace,
		readDocument,
		writeDocument,
		reportSaveError,
		saveLastOpenedFiles,
		setWorkspacePath: (path: string) => {
			workspacePath = path
		},
	}
}

const recordDraft = (
	workspace: ReturnType<typeof createDocumentWorkspace>,
	draft: () => { content: string; title: string },
) => {
	const document = selectActiveTab(workspace.getSnapshot())!
	workspace.commands.registerDocumentSnapshotProvider(
		document.documentId,
		document.sessionEpoch,
		draft,
	)
	workspace.commands.recordDocumentEdit(
		document.documentId,
		document.sessionEpoch,
	)
	return document
}

const getActiveTabHistoryState = (
	workspace: ReturnType<typeof createTestDocuments>["workspace"],
) => {
	const activeTab = selectActiveTab(workspace.getSnapshot())
	return {
		history: activeTab?.history ?? [],
		historyIndex: activeTab?.historyIndex ?? -1,
	}
}

const getOpenTabPaths = (
	workspace: ReturnType<typeof createTestDocuments>["workspace"],
) => selectResolvedTabs(workspace.getSnapshot()).map((tab) => tab.path)

const getOpenTabByPath = (
	workspace: ReturnType<typeof createTestDocuments>["workspace"],
	path: string,
) =>
	selectResolvedTabs(workspace.getSnapshot()).find(
		(tab) => tab.path === path,
	) ?? null

const getOpenDocumentByPath = (
	workspace: ReturnType<typeof createTestDocuments>["workspace"],
	path: string,
) =>
	workspace
		.getSnapshot()
		.openDocuments.find((document) => document.path === path) ?? null

const setActiveSelectionProvider = (
	workspace: ReturnType<typeof createTestDocuments>["workspace"],
	provider: () => TabHistorySelection,
) => {
	const activeTabId = selectActiveTab(workspace.getSnapshot())?.id
	expect(activeTabId).toBeTypeOf("number")
	workspace.commands.setTabHistorySelectionProvider(
		activeTabId as number,
		provider,
	)
}

const consumeActiveSelection = (
	workspace: ReturnType<typeof createDocumentWorkspace>,
	path: string,
) =>
	workspace.commands.consumeTabPendingHistorySelectionRestore(
		workspace.getSnapshot().activeTabId!,
		path,
	)

describe("document workspace", () => {
	it("stores the current tab selection when opening another note in the same tab", async () => {
		const { workspace } = createTestDocuments()
		let currentSelection: TabHistorySelection = null

		await workspace.commands.openTab("/notes/a.md")
		setActiveSelectionProvider(workspace, () => currentSelection)

		const selectionInA = createSelection([2, 0], 4)
		currentSelection = selectionInA

		await workspace.commands.openTab("/notes/b.md")

		expect(getOpenTabPaths(workspace)).toEqual(["/notes/b.md"])
		expect(getActiveTabHistoryState(workspace)).toEqual({
			history: [
				{ path: "/notes/a.md", selection: selectionInA },
				{ path: "/notes/b.md", selection: null },
			],
			historyIndex: 1,
		})
	})

	it("captures selection on goBack and restores the previous note in the same tab", async () => {
		const { workspace } = createTestDocuments()
		let currentSelection: TabHistorySelection = null

		await workspace.commands.openTab("/notes/a.md")
		setActiveSelectionProvider(workspace, () => currentSelection)
		const selectionInA = createSelection([0, 0], 3)
		currentSelection = selectionInA
		await workspace.commands.openTab("/notes/b.md")

		const selectionInB = createSelection([5, 1], 2)
		currentSelection = selectionInB

		const moved = await workspace.commands.goBack()
		expect(moved).toBe(true)

		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/a.md")
		expect(getActiveTabHistoryState(workspace)).toEqual({
			history: [
				{ path: "/notes/a.md", selection: selectionInA },
				{ path: "/notes/b.md", selection: selectionInB },
			],
			historyIndex: 0,
		})
		expect(consumeActiveSelection(workspace, "/notes/b.md")).toEqual({
			found: false,
		})
		expect(consumeActiveSelection(workspace, "/notes/a.md")).toEqual({
			found: true,
			selection: selectionInA,
		})
	})

	it("captures selection on goForward and restores the target note selection", async () => {
		const { workspace } = createTestDocuments()
		let currentSelection: TabHistorySelection = null

		await workspace.commands.openTab("/notes/a.md")
		setActiveSelectionProvider(workspace, () => currentSelection)
		const selectionInA = createSelection([1, 0], 1)
		currentSelection = selectionInA
		await workspace.commands.openTab("/notes/b.md")

		const selectionInB = createSelection([3, 0], 7)
		currentSelection = selectionInB
		await workspace.commands.goBack()
		expect(consumeActiveSelection(workspace, "/notes/a.md")).toEqual({
			found: true,
			selection: selectionInA,
		})

		const selectionInAAfterBack = createSelection([4, 0], 5)
		currentSelection = selectionInAAfterBack
		const movedForward = await workspace.commands.goForward()

		expect(movedForward).toBe(true)
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/b.md")
		expect(getActiveTabHistoryState(workspace)).toEqual({
			history: [
				{ path: "/notes/a.md", selection: selectionInAAfterBack },
				{ path: "/notes/b.md", selection: selectionInB },
			],
			historyIndex: 1,
		})
		expect(consumeActiveSelection(workspace, "/notes/b.md")).toEqual({
			found: true,
			selection: selectionInB,
		})
	})

	it("flushes the outgoing draft before navigating history", async () => {
		const { workspace } = createTestDocuments()
		let currentSelection: TabHistorySelection = null

		await workspace.commands.openTab("/notes/a.md")
		setActiveSelectionProvider(workspace, () => currentSelection)
		currentSelection = createSelection([1, 0], 2)
		await workspace.commands.openTab("/notes/b.md")

		recordDraft(workspace, () => ({
			content: "draft",
			title: selectActiveTab(workspace.getSnapshot())!.name,
		}))
		expect(selectIsSaved(workspace.getSnapshot())).toBe(false)

		const movedBack = await workspace.commands.goBack()

		expect(movedBack).toBe(true)
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/a.md")
		expect(selectIsSaved(workspace.getSnapshot())).toBe(true)
	})

	it.each([
		{ content: "updated", revision: "updated" },
		null,
	])("rechecks a navigation destination after a save when disk returns %j", async (latest) => {
		const destination = "/notes/b.md"
		let disk: DiskDocument | null = { content: "original", revision: "old" }
		const write = createDeferredPromise<DocumentWriteResult>()
		const writeDocument = vi.fn(() => write.promise)
		const { workspace } = createTestDocuments({
			readDocument: async (path) =>
				path === destination ? disk : { content: "a", revision: "a" },
			writeDocument,
		})
		await workspace.commands.openTab("/notes/a.md")
		recordDraft(workspace, () => ({ content: "draft", title: "a" }))

		const opening = workspace.commands.openTab(destination)
		await waitForAssertion(() => expect(writeDocument).toHaveBeenCalled())
		disk = latest
		write.resolve({ status: "saved", revision: "saved" })
		await opening

		expect(selectActiveTab(workspace.getSnapshot())).toMatchObject(
			latest
				? { path: destination, content: latest.content, isSaved: true }
				: { path: "/notes/a.md", content: "draft", isSaved: true },
		)
	})

	it("navigates history even when selection provider throws", async () => {
		const { workspace } = createTestDocuments()
		let currentSelection: TabHistorySelection = null
		let shouldThrow = false

		await workspace.commands.openTab("/notes/a.md")
		setActiveSelectionProvider(workspace, () => {
			if (shouldThrow) {
				throw new Error("selection unavailable")
			}

			return currentSelection
		})
		const selectionInA = createSelection([2, 1], 6)
		currentSelection = selectionInA
		await workspace.commands.openTab("/notes/b.md")

		shouldThrow = true
		const movedBack = await workspace.commands.goBack()

		expect(movedBack).toBe(true)
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/a.md")
		expect(getActiveTabHistoryState(workspace)).toEqual({
			history: [
				{ path: "/notes/a.md", selection: selectionInA },
				{ path: "/notes/b.md", selection: null },
			],
			historyIndex: 0,
		})
	})

	it("persists only the currently open tabs as relative paths", async () => {
		const { workspace, saveLastOpenedFiles, setWorkspacePath } =
			createTestDocuments()
		setWorkspacePath("/workspace")

		await workspace.commands.openTab("/workspace/1.md")
		await workspace.commands.openTab("/workspace/2.md")
		await workspace.commands.openTab("/workspace/3.md")
		await workspace.commands.openTab("/workspace/4.md")
		await workspace.commands.openTab("/workspace/5.md")
		await workspace.commands.openTab("/workspace/6.md")

		expect(saveLastOpenedFiles).toHaveBeenLastCalledWith("/workspace", ["6.md"])
	})

	it("does not persist opened file state without a workspace", async () => {
		const { workspace, saveLastOpenedFiles } = createTestDocuments()

		await workspace.commands.openTab("/notes/a.md")
		await workspace.commands.openTab("/notes/b.md")

		expect(saveLastOpenedFiles).not.toHaveBeenCalled()
	})

	it("persists the remaining restored tabs when one tab closes", async () => {
		const { workspace, saveLastOpenedFiles, setWorkspacePath } =
			createTestDocuments()
		setWorkspacePath("/workspace")

		await workspace.commands.hydrateFromOpenedFiles([
			"/workspace/a.md",
			"/workspace/b.md",
			"/workspace/c.md",
		])

		workspace.commands.closeTabById(
			getOpenTabByPath(workspace, "/workspace/b.md")!.id,
		)

		await waitForAssertion(() =>
			expect(saveLastOpenedFiles).toHaveBeenLastCalledWith("/workspace", [
				"a.md",
				"c.md",
			]),
		)
	})

	it("serializes close-tab persistence updates", async () => {
		const firstPersist = createDeferredPromise<void>()
		const secondPersist = createDeferredPromise<void>()
		const saveLastOpenedFiles = vi
			.fn<DocumentWorkspaceDependencies["saveLastOpenedFiles"]>()
			.mockResolvedValue(undefined)
		const { workspace, setWorkspacePath } = createTestDocuments({
			saveLastOpenedFiles,
		})
		setWorkspacePath("/workspace")

		await workspace.commands.hydrateFromOpenedFiles([
			"/workspace/a.md",
			"/workspace/b.md",
		])

		saveLastOpenedFiles.mockReset()
		saveLastOpenedFiles
			.mockImplementationOnce(async () => firstPersist.promise)
			.mockImplementationOnce(async () => secondPersist.promise)

		workspace.commands.closeTabById(
			getOpenTabByPath(workspace, "/workspace/a.md")!.id,
		)
		workspace.commands.closeTabById(
			getOpenTabByPath(workspace, "/workspace/b.md")!.id,
		)
		await waitForAssertion(() =>
			expect(saveLastOpenedFiles).toHaveBeenCalledTimes(1),
		)

		expect(saveLastOpenedFiles).toHaveBeenNthCalledWith(1, "/workspace", [
			"b.md",
		])

		firstPersist.resolve(undefined)
		await waitForAssertion(() =>
			expect(saveLastOpenedFiles).toHaveBeenCalledTimes(2),
		)

		expect(saveLastOpenedFiles).toHaveBeenNthCalledWith(2, "/workspace", [])

		secondPersist.resolve(undefined)
		await flushMicrotasks()
	})

	it("hydrates opened files as tabs with fresh per-tab history", async () => {
		const { workspace } = createTestDocuments()

		const hydrated = await workspace.commands.hydrateFromOpenedFiles([
			"/notes/a.md",
			"/notes/b.md",
			"/notes/c.md",
		])

		expect(hydrated).toBe(true)
		expect(getOpenTabPaths(workspace)).toEqual([
			"/notes/a.md",
			"/notes/b.md",
			"/notes/c.md",
		])
		expect(getOpenTabByPath(workspace, "/notes/a.md")).toEqual(
			expect.objectContaining({
				history: [{ path: "/notes/a.md", selection: null }],
				historyIndex: 0,
			}),
		)
		expect(getOpenTabByPath(workspace, "/notes/b.md")).toEqual(
			expect.objectContaining({
				history: [{ path: "/notes/b.md", selection: null }],
				historyIndex: 0,
			}),
		)
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/c.md")
	})

	it("replaces the active tab instead of appending a new tab when opening a note", async () => {
		const { workspace } = createTestDocuments()

		await workspace.commands.openTab("/notes/a.md")
		const firstTabId = selectActiveTab(workspace.getSnapshot())?.id
		const firstDocumentId = selectActiveDocumentId(workspace.getSnapshot())

		await workspace.commands.openTab("/notes/b.md")

		expect(getOpenTabPaths(workspace)).toEqual(["/notes/b.md"])
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/b.md")
		expect(selectActiveTab(workspace.getSnapshot())?.id).toBe(firstTabId)
		expect(selectActiveDocumentId(workspace.getSnapshot())).not.toBe(
			firstDocumentId,
		)
		expect(selectActiveTab(workspace.getSnapshot())?.sessionEpoch).toBe(0)
		expect(getActiveTabHistoryState(workspace)).toEqual({
			history: [
				{ path: "/notes/a.md", selection: null },
				{ path: "/notes/b.md", selection: null },
			],
			historyIndex: 1,
		})
	})

	it("queues title selection when opening a note with title initial selection", async () => {
		const { workspace } = createTestDocuments()

		await workspace.commands.openTab("/notes/a.md")
		await workspace.commands.openTab("/notes/My Note.md", false, false, {
			initialSelection: "title",
		})

		expect(consumeActiveSelection(workspace, "/notes/My Note.md")).toEqual({
			found: true,
			selection: createSelection([0, 0], 0, [0, 0], "My Note".length),
		})
	})

	it("opens the first note in a new tab when there is no active tab", async () => {
		const { workspace } = createTestDocuments()

		await workspace.commands.openTabInNewTab("/notes/a.md")

		expect(getOpenTabPaths(workspace)).toEqual(["/notes/a.md"])
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/a.md")
		expect(getActiveTabHistoryState(workspace)).toEqual({
			history: [{ path: "/notes/a.md", selection: null }],
			historyIndex: 0,
		})
	})

	it("appends a note as a new tab without replacing the current tab", async () => {
		const { workspace } = createTestDocuments()

		await workspace.commands.openTab("/notes/a.md")
		const firstTabId = selectActiveTab(workspace.getSnapshot())?.id

		await workspace.commands.openTabInNewTab("/notes/b.md")

		expect(getOpenTabPaths(workspace)).toEqual(["/notes/a.md", "/notes/b.md"])
		expect(getOpenTabByPath(workspace, "/notes/a.md")?.id).toBe(firstTabId)
		expect(getOpenTabByPath(workspace, "/notes/a.md")).toEqual(
			expect.objectContaining({
				history: [{ path: "/notes/a.md", selection: null }],
				historyIndex: 0,
			}),
		)
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/b.md")
		expect(getOpenTabByPath(workspace, "/notes/b.md")).toEqual(
			expect.objectContaining({
				history: [{ path: "/notes/b.md", selection: null }],
				historyIndex: 0,
			}),
		)
	})

	it("rebinds the active tab to a shared document without closing existing aliases", async () => {
		const { workspace } = createTestDocuments()

		await workspace.commands.hydrateFromOpenedFiles([
			"/notes/a.md",
			"/notes/b.md",
		])

		const existingDocumentId = getOpenDocumentByPath(
			workspace,
			"/notes/a.md",
		)?.id
		const previousActiveTabId = selectActiveTab(workspace.getSnapshot())?.id

		await workspace.commands.openTab("/notes/a.md")

		expect(getOpenTabPaths(workspace)).toEqual(["/notes/a.md", "/notes/a.md"])
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/a.md")
		expect(selectActiveTab(workspace.getSnapshot())?.id).toBe(
			previousActiveTabId,
		)
		expect(workspace.getSnapshot().openDocuments).toHaveLength(1)
		expect(selectActiveDocumentId(workspace.getSnapshot())).toBe(
			existingDocumentId,
		)
		expect(workspace.getSnapshot().tabs.map((tab) => tab.documentId)).toEqual([
			existingDocumentId,
			existingDocumentId,
		])
		expect(getActiveTabHistoryState(workspace)).toEqual({
			history: [
				{ path: "/notes/b.md", selection: null },
				{ path: "/notes/a.md", selection: null },
			],
			historyIndex: 1,
		})
	})

	it("creates a duplicate alias tab that reuses the existing document", async () => {
		const { workspace, readDocument } = createTestDocuments()

		await workspace.commands.hydrateFromOpenedFiles([
			"/notes/a.md",
			"/notes/b.md",
		])

		vi.mocked(readDocument).mockClear()

		await workspace.commands.openTabInNewTab("/notes/a.md")

		expect(getOpenTabPaths(workspace)).toEqual([
			"/notes/a.md",
			"/notes/b.md",
			"/notes/a.md",
		])
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/a.md")
		expect(workspace.getSnapshot().tabs).toHaveLength(3)
		expect(workspace.getSnapshot().tabs[0]?.documentId).toBe(
			workspace.getSnapshot().tabs[2]?.documentId,
		)
		expect(workspace.getSnapshot().openDocuments).toHaveLength(2)
		expect(selectActiveTab(workspace.getSnapshot())).toEqual(
			expect.objectContaining({
				history: [{ path: "/notes/a.md", selection: null }],
				historyIndex: 0,
			}),
		)
		expect(vi.mocked(readDocument)).not.toHaveBeenCalled()
	})

	it("hydrates duplicate paths as alias tabs pointing to one document", async () => {
		const { workspace } = createTestDocuments()

		const hydrated = await workspace.commands.hydrateFromOpenedFiles([
			"/notes/a.md",
			"/notes/b.md",
			"/notes/a.md",
		])

		expect(hydrated).toBe(true)
		expect(getOpenTabPaths(workspace)).toEqual([
			"/notes/a.md",
			"/notes/b.md",
			"/notes/a.md",
		])
		expect(workspace.getSnapshot().tabs).toHaveLength(3)
		expect(workspace.getSnapshot().openDocuments).toHaveLength(2)
		expect(workspace.getSnapshot().tabs[0]?.documentId).toBe(
			workspace.getSnapshot().tabs[2]?.documentId,
		)
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/a.md")
	})

	it("persists appended tabs when opening a note in a new tab", async () => {
		const { workspace, saveLastOpenedFiles, setWorkspacePath } =
			createTestDocuments()
		setWorkspacePath("/workspace")

		await workspace.commands.openTab("/workspace/1.md")
		await workspace.commands.openTabInNewTab("/workspace/2.md")
		await workspace.commands.openTabInNewTab("/workspace/3.md")

		expect(saveLastOpenedFiles).toHaveBeenLastCalledWith("/workspace", [
			"1.md",
			"2.md",
			"3.md",
		])
	})

	it("activates an existing restored tab without rewriting the tab list", async () => {
		const { workspace } = createTestDocuments()

		await workspace.commands.hydrateFromOpenedFiles([
			"/notes/a.md",
			"/notes/b.md",
		])

		const targetTabId = getOpenTabByPath(workspace, "/notes/a.md")?.id
		expect(targetTabId).toBeTypeOf("number")

		workspace.commands.activateTabById(targetTabId as number)

		expect(getOpenTabPaths(workspace)).toEqual(["/notes/a.md", "/notes/b.md"])
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/a.md")
		expect(getOpenTabByPath(workspace, "/notes/a.md")).toEqual(
			expect.objectContaining({
				history: [
					{ path: "/notes/a.md", selection: null },
					{ path: "/notes/a.md", selection: null },
				],
				historyIndex: 1,
			}),
		)
	})

	it("cycles to the next and previous restored tab", async () => {
		const { workspace } = createTestDocuments()

		await workspace.commands.hydrateFromOpenedFiles([
			"/notes/a.md",
			"/notes/b.md",
			"/notes/c.md",
		])

		workspace.commands.activatePreviousTab()
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/b.md")

		workspace.commands.activateNextTab()
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/c.md")

		workspace.commands.activateNextTab()
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/a.md")
	})

	it("persists restored tab order after activating an existing tab", async () => {
		const { workspace, saveLastOpenedFiles, setWorkspacePath } =
			createTestDocuments()
		setWorkspacePath("/workspace")

		await workspace.commands.hydrateFromOpenedFiles([
			"/workspace/a.md",
			"/workspace/b.md",
		])

		const targetTabId = getOpenTabByPath(workspace, "/workspace/a.md")?.id
		workspace.commands.activateTabById(targetTabId as number)

		await waitForAssertion(() =>
			expect(saveLastOpenedFiles).toHaveBeenLastCalledWith("/workspace", [
				"b.md",
				"a.md",
			]),
		)
	})

	it("closes the active restored tab and falls back to a neighbor", async () => {
		const { workspace } = createTestDocuments()

		await workspace.commands.hydrateFromOpenedFiles([
			"/notes/a.md",
			"/notes/b.md",
			"/notes/c.md",
		])

		workspace.commands.closeActiveTab()

		expect(getOpenTabPaths(workspace)).toEqual(["/notes/a.md", "/notes/b.md"])
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/b.md")
	})

	it("removes deleted tabs while preserving unrelated restored tabs", async () => {
		const { workspace } = createTestDocuments()

		await workspace.commands.hydrateFromOpenedFiles([
			"/notes/a.md",
			"/notes/b.md",
		])

		workspace.commands.removePathsFromHistory(["/notes/b.md"])

		expect(getOpenTabPaths(workspace)).toEqual(["/notes/a.md"])
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/a.md")
	})

	it("removes deleted paths from the current tab history without closing the tab", async () => {
		const { workspace } = createTestDocuments()

		await workspace.commands.openTab("/notes/a.md")
		await workspace.commands.openTab("/notes/b.md")
		await workspace.commands.openTab("/notes/c.md")

		workspace.commands.removePathsFromHistory(["/notes/b.md"])

		expect(getOpenTabPaths(workspace)).toEqual(["/notes/c.md"])
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/c.md")
		expect(getActiveTabHistoryState(workspace)).toEqual({
			history: [
				{ path: "/notes/a.md", selection: null },
				{ path: "/notes/c.md", selection: null },
			],
			historyIndex: 1,
		})
	})

	it("renames inactive restored tabs without disturbing the active tab", async () => {
		const { workspace } = createTestDocuments()

		await workspace.commands.hydrateFromOpenedFiles([
			"/notes/a.md",
			"/notes/b.md",
		])

		await workspace.commands.renameTab("/notes/a.md", "/notes/a-renamed.md")

		expect(getOpenTabPaths(workspace)).toEqual([
			"/notes/a-renamed.md",
			"/notes/b.md",
		])
		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/b.md")
		expect(getOpenTabByPath(workspace, "/notes/a-renamed.md")).toEqual(
			expect.objectContaining({
				history: [{ path: "/notes/a-renamed.md", selection: null }],
				historyIndex: 0,
			}),
		)
	})

	it("refreshes the active tab from external content and queues selection restore", async () => {
		const { workspace } = createTestDocuments()
		const selectionInA = createSelection([2, 0], 4, [2, 0], 8)

		await workspace.commands.openTab("/notes/a.md")
		setActiveSelectionProvider(workspace, () => selectionInA)

		const initialTabId = selectActiveTab(workspace.getSnapshot())?.id
		const initialSessionEpoch = selectActiveTab(
			workspace.getSnapshot(),
		)?.sessionEpoch
		await workspace.commands.refreshTabFromExternalContent(
			"/notes/a.md",
			"external-content",
			{
				preserveSelection: true,
				revision: "external",
			},
		)

		expect(selectActiveTab(workspace.getSnapshot())).toEqual(
			expect.objectContaining({
				id: expect.any(Number),
				path: "/notes/a.md",
				name: "a",
				content: "external-content",
			}),
		)
		expect(selectActiveTab(workspace.getSnapshot())?.id).toBe(initialTabId)
		expect(selectActiveTab(workspace.getSnapshot())?.sessionEpoch).toBe(
			(initialSessionEpoch ?? 0) + 1,
		)
		expect(selectIsSaved(workspace.getSnapshot())).toBe(true)
		expect(getActiveTabHistoryState(workspace)).toEqual({
			history: [
				{
					path: "/notes/a.md",
					selection: selectionInA,
				},
			],
			historyIndex: 0,
		})
		expect(consumeActiveSelection(workspace, "/notes/a.md")).toEqual({
			found: true,
			selection: selectionInA,
		})
	})

	it("tracks saved state per active tab id", async () => {
		const { workspace } = createTestDocuments()

		await workspace.commands.openTab("/notes/a.md")
		recordDraft(workspace, () => ({
			content: "draft",
			title: selectActiveTab(workspace.getSnapshot())!.name,
		}))
		expect(selectIsSaved(workspace.getSnapshot())).toBe(false)
		expect(getOpenDocumentByPath(workspace, "/notes/a.md")?.isSaved).toBe(false)
		expect(workspace.commands.getOpenDocumentSnapshots()).toEqual([
			expect.objectContaining({ path: "/notes/a.md", isSaved: false }),
		])
	})

	it("shares saved state across duplicate aliases", async () => {
		const { workspace } = createTestDocuments()

		await workspace.commands.openTab("/notes/a.md")
		const firstTabId = selectActiveTab(workspace.getSnapshot())?.id
		await workspace.commands.openTabInNewTab("/notes/a.md")
		const secondTabId = selectActiveTab(workspace.getSnapshot())?.id

		recordDraft(workspace, () => ({ content: "draft", title: "a" }))

		expect(selectResolvedTabs(workspace.getSnapshot())).toEqual([
			expect.objectContaining({
				id: firstTabId,
				path: "/notes/a.md",
				isSaved: false,
			}),
			expect.objectContaining({
				id: secondTabId,
				path: "/notes/a.md",
				isSaved: false,
			}),
		])
		expect(workspace.commands.getOpenDocumentSnapshots()).toEqual([
			expect.objectContaining({
				path: "/notes/a.md",
				isSaved: false,
			}),
		])
	})

	it("coalesces a pending write and closes only after later edits are saved", async () => {
		const firstWrite = createDeferredPromise<DocumentWriteResult>()
		const writeDocument = vi
			.fn<DocumentWorkspaceDependencies["writeDocument"]>()
			.mockReturnValueOnce(firstWrite.promise)
			.mockResolvedValueOnce({ status: "saved", revision: "second" })
		const { workspace } = createTestDocuments({ writeDocument })
		await workspace.commands.openTab("/notes/a.md")
		const draft = { content: "first", title: "a" }
		const doc = recordDraft(workspace, () => draft)
		const firstSave = workspace.commands.requestDocumentSave(doc.documentId)
		const duplicateSave = workspace.commands.requestDocumentSave(doc.documentId)
		const close = workspace.commands.closeTabById(doc.id)
		await waitForAssertion(() => expect(writeDocument).toHaveBeenCalledTimes(1))

		draft.content = "second"
		workspace.commands.recordDocumentEdit(doc.documentId, doc.sessionEpoch)
		firstWrite.resolve({ status: "saved", revision: "first" })

		expect(await Promise.all([firstSave, duplicateSave, close])).toEqual([
			true,
			true,
			true,
		])
		expect(writeDocument.mock.calls).toEqual([
			[
				{
					path: "/notes/a.md",
					expectedRevision: "initial:/notes/a.md",
					content: "first",
				},
			],
			[{ path: "/notes/a.md", expectedRevision: "first", content: "second" }],
		])
		expect(workspace.getSnapshot().tabs).toHaveLength(0)
	})

	it("leaves the final alias open after a failed save and retries its draft", async () => {
		const error = new Error("disk write failed")
		const writeDocument = vi
			.fn<DocumentWorkspaceDependencies["writeDocument"]>()
			.mockRejectedValueOnce(error)
			.mockResolvedValueOnce({ status: "saved", revision: "new" })
		const { workspace, reportSaveError } = createTestDocuments({
			writeDocument,
		})
		await workspace.commands.openTab("/notes/a.md")
		const first = selectActiveTab(workspace.getSnapshot())!
		await workspace.commands.openTabInNewTab("/notes/a.md")
		const final = recordDraft(workspace, () => ({
			content: "local draft",
			title: "a",
		}))

		expect(await workspace.commands.closeTabById(first.id)).toBe(true)
		expect(writeDocument).not.toHaveBeenCalled()
		expect(await workspace.commands.closeTabById(final.id)).toBe(false)
		expect(reportSaveError).toHaveBeenCalledWith(error)
		expect(selectActiveTab(workspace.getSnapshot())).toMatchObject({
			id: final.id,
			isSaved: false,
		})
		expect(await workspace.commands.closeTabById(final.id)).toBe(true)
		expect(writeDocument).toHaveBeenLastCalledWith({
			path: "/notes/a.md",
			expectedRevision: "initial:/notes/a.md",
			content: "local draft",
		})
	})

	it("blocks overwriting an external edit and reloads only on explicit discard", async () => {
		const { workspace, readDocument, writeDocument } = createTestDocuments()
		await workspace.commands.openTab("/notes/a.md")
		const doc = recordDraft(workspace, () => ({
			content: "local draft",
			title: "a",
		}))

		await workspace.commands.refreshTabFromExternalContent(
			"/notes/a.md",
			"external",
			{ revision: "external-version" },
		)
		expect(await workspace.commands.closeTabById(doc.id)).toBe(false)
		expect(writeDocument).not.toHaveBeenCalled()
		expect(workspace.commands.getDocumentById(doc.documentId)).toMatchObject({
			conflict: { type: "changed", content: "external" },
			sessionEpoch: doc.sessionEpoch,
		})

		vi.mocked(readDocument).mockResolvedValue({
			content: "external",
			revision: "external-version",
		})
		expect(
			await workspace.commands.discardDocumentChanges(doc.documentId),
		).toBe(true)
		workspace.commands.recordDocumentEdit(doc.documentId, doc.sessionEpoch)
		expect(workspace.commands.getDocumentById(doc.documentId)).toMatchObject({
			content: "external",
			diskRevision: "external-version",
			isSaved: true,
			sessionEpoch: doc.sessionEpoch + 1,
		})
	})

	it("keeps a dirty deleted file open for conflict resolution", async () => {
		const { workspace, writeDocument } = createTestDocuments()
		await workspace.commands.openTab("/notes/a.md")
		const doc = recordDraft(workspace, () => ({
			content: "local draft",
			title: "a",
		}))
		workspace.commands.removePathsFromHistory(["/notes/a.md"], {
			preserveUnsaved: true,
		})

		expect(await workspace.commands.closeTabById(doc.id)).toBe(false)
		expect(writeDocument).not.toHaveBeenCalled()
		expect(
			workspace.commands.getDocumentById(doc.documentId)?.conflict,
		).toEqual({ type: "deleted" })
		expect(
			await workspace.commands.discardDocumentChanges(doc.documentId),
		).toBe(true)
		expect(workspace.getSnapshot().tabs).toHaveLength(0)
	})

	it("discards only the deleted document when its old path now contains another draft", async () => {
		const { workspace } = createTestDocuments()
		await workspace.commands.openTab("/notes/a.md")
		const deleted = recordDraft(workspace, () => ({
			content: "deleted draft",
			title: "a",
		}))
		workspace.commands.removePathsFromHistory(["/notes/a.md"], {
			preserveUnsaved: true,
		})
		await workspace.commands.openTabInNewTab("/notes/a.md/child.md")
		const nested = recordDraft(workspace, () => ({
			content: "nested draft",
			title: "child",
		}))

		expect(
			await workspace.commands.discardDocumentChanges(deleted.documentId),
		).toBe(true)
		expect(workspace.commands.getDocumentById(deleted.documentId)).toBeNull()
		expect(workspace.commands.getDocumentById(nested.documentId)).toMatchObject(
			{
				path: "/notes/a.md/child.md",
				isSaved: false,
			},
		)
	})

	it("restores a same-path history visit without replacing the dirty editor session", async () => {
		const { workspace, writeDocument } = createTestDocuments()
		await workspace.commands.hydrateFromOpenedFiles([
			"/notes/a.md",
			"/notes/b.md",
		])
		workspace.commands.activateTabById(
			getOpenTabByPath(workspace, "/notes/a.md")!.id,
		)
		const document = recordDraft(workspace, () => ({
			content: "draft",
			title: "a",
		}))

		expect(await workspace.commands.goBack()).toBe(true)
		expect(selectActiveTab(workspace.getSnapshot())).toMatchObject({
			id: document.id,
			sessionEpoch: document.sessionEpoch,
			historyIndex: 0,
			isSaved: false,
		})
		expect(
			workspace.commands.consumeTabPendingHistorySelectionRestore(
				document.id,
				"/notes/a.md",
			),
		).toEqual({
			found: true,
			selection: null,
		})
		expect(writeDocument).not.toHaveBeenCalled()
	})

	it("retries a failed title rename using the last persisted file revision", async () => {
		const renameDocument = vi
			.fn<DocumentWorkspaceDependencies["renameDocument"]>()
			.mockRejectedValueOnce(new Error("rename failed"))
			.mockResolvedValueOnce({ status: "renamed", revision: "renamed" })
		const onRenamed = vi.fn()
		const { workspace, writeDocument } = createTestDocuments({
			renameDocument,
			onRenamed,
		})
		await workspace.commands.openTab("/notes/a.md")
		const doc = recordDraft(workspace, () => ({
			content: "draft",
			title: "New title",
		}))

		expect(await workspace.commands.closeTabById(doc.id)).toBe(false)
		expect(workspace.commands.getDocumentById(doc.documentId)).toMatchObject({
			content: "draft",
			diskRevision: "written",
			path: "/notes/a.md",
			isSaved: false,
		})
		expect(await workspace.commands.closeTabById(doc.id)).toBe(true)
		expect(writeDocument).toHaveBeenNthCalledWith(2, {
			path: "/notes/a.md",
			content: "draft",
			expectedRevision: "written",
		})
		expect(renameDocument).toHaveBeenLastCalledWith({
			oldPath: "/notes/a.md",
			newPath: "/notes/New title.md",
			expectedRevision: "written",
		})
		expect(onRenamed).toHaveBeenCalledExactlyOnceWith(
			"/notes/a.md",
			"/notes/New title.md",
		)
	})

	it("keeps a title rename pending while the note is locked", async () => {
		const renameDocument = vi
			.fn<DocumentWorkspaceDependencies["renameDocument"]>()
			.mockResolvedValue({ status: "renamed", revision: "renamed" })
		const isRenameBlocked = vi.fn().mockReturnValueOnce(true)
		const { workspace } = createTestDocuments({
			renameDocument,
			isRenameBlocked,
		})
		await workspace.commands.openTab("/notes/a.md")
		const document = recordDraft(workspace, () => ({
			content: "draft",
			title: "New title",
		}))

		expect(
			await workspace.commands.requestDocumentSave(document.documentId),
		).toBe(false)
		expect(isRenameBlocked).toHaveBeenCalledWith(
			"/notes/a.md",
			"/notes/New title.md",
		)
		expect(renameDocument).not.toHaveBeenCalled()
		expect(selectIsSaved(workspace.getSnapshot())).toBe(false)
		expect(
			await workspace.commands.requestDocumentSave(document.documentId),
		).toBe(true)
		expect(selectActiveTab(workspace.getSnapshot())).toMatchObject({
			path: "/notes/New title.md",
			isSaved: true,
		})
	})

	it("reserves a deleted draft's path until the draft is discarded", async () => {
		const source = "/notes/a.md"
		const destination = "/notes/b.md"
		const renameDocument = vi
			.fn<DocumentWorkspaceDependencies["renameDocument"]>()
			.mockResolvedValue({ status: "renamed", revision: "renamed" })
		const { workspace, reportSaveError } = createTestDocuments({
			renameDocument,
		})
		await workspace.commands.openTab(source)
		const a = recordDraft(workspace, () => ({ content: "draft a", title: "b" }))
		await workspace.commands.openTabInNewTab(destination)
		const b = recordDraft(workspace, () => ({ content: "draft b", title: "b" }))
		workspace.commands.removePathsFromHistory([destination], {
			preserveUnsaved: true,
		})

		expect(await workspace.commands.requestDocumentSave(a.documentId)).toBe(
			false,
		)
		expect(renameDocument).not.toHaveBeenCalled()
		expect(reportSaveError).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.stringContaining("open note at the destination"),
			}),
		)
		expect(getOpenTabPaths(workspace)).toEqual([source, destination])

		expect(await workspace.commands.discardDocumentChanges(b.documentId)).toBe(
			true,
		)
		expect(await workspace.commands.requestDocumentSave(a.documentId)).toBe(
			true,
		)
		expect(getOpenTabPaths(workspace)).toEqual([destination])
		expect(workspace.getSnapshot().openDocuments[0]?.id).toBe(a.documentId)
	})

	it("does not open a second session at the destination of an in-flight rename", async () => {
		const source = "/notes/a.md"
		const destination = "/notes/b.md"
		const rename = createDeferredPromise<{
			status: "renamed"
			revision: string
		}>()
		const renameDocument = vi.fn(() => rename.promise)
		const { workspace } = createTestDocuments({ renameDocument })
		await workspace.commands.openTab(source)
		const doc = recordDraft(workspace, () => ({ content: "draft", title: "b" }))
		const saving = workspace.commands.requestDocumentSave(doc.documentId)
		await waitForAssertion(() => expect(renameDocument).toHaveBeenCalled())

		await workspace.commands.openTabInNewTab(destination)
		expect(getOpenTabPaths(workspace)).toEqual([source])

		rename.resolve({ status: "renamed", revision: "renamed" })
		expect(await saving).toBe(true)
		await workspace.commands.openTabInNewTab(destination)
		expect(getOpenTabPaths(workspace)).toEqual([destination, destination])
		expect(workspace.getSnapshot().openDocuments).toHaveLength(1)
	})

	it("keeps the latest tab navigation when an earlier file read finishes late", async () => {
		const pending = createDeferredPromise<DiskDocument>()
		const readDocument = vi.fn(async (path: string) =>
			path === "/notes/b.md"
				? pending.promise
				: { content: path, revision: path },
		)
		const { workspace } = createTestDocuments({ readDocument })
		await workspace.commands.openTab("/notes/a.md")
		const earlier = workspace.commands.openTab("/notes/b.md")
		await waitForAssertion(() =>
			expect(readDocument).toHaveBeenCalledWith("/notes/b.md"),
		)
		await workspace.commands.openTab("/notes/c.md")
		pending.resolve({ content: "b", revision: "b" })
		await earlier

		expect(selectActiveTab(workspace.getSnapshot())?.path).toBe("/notes/c.md")
		expect(
			selectActiveTab(workspace.getSnapshot())?.history.map(
				(entry) => entry.path,
			),
		).toEqual(["/notes/a.md", "/notes/c.md"])
	})

	it("leaves history and the active note intact when loading a history entry fails", async () => {
		const { workspace, readDocument } = createTestDocuments()
		await workspace.commands.openTab("/notes/a.md")
		await workspace.commands.openTab("/notes/b.md")
		const error = new Error("access revoked")
		const log = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			vi.mocked(readDocument).mockRejectedValueOnce(error)
			expect(await workspace.commands.goBack()).toBe(false)
			expect(selectActiveTab(workspace.getSnapshot())).toMatchObject({
				path: "/notes/b.md",
				historyIndex: 1,
			})
			expect(log).toHaveBeenCalledWith(
				"Failed to navigate note history:",
				error,
			)
		} finally {
			log.mockRestore()
		}
	})

	it("waits for a moved document's new baseline before writing its draft", async () => {
		const movedRead = createDeferredPromise<DiskDocument>()
		const readDocument = vi.fn(async (path: string) =>
			path === "/notes/moved/a.md"
				? movedRead.promise
				: { content: "original", revision: "old" },
		)
		const { workspace, writeDocument } = createTestDocuments({ readDocument })
		await workspace.commands.openTab("/notes/source/a.md")
		const doc = recordDraft(workspace, () => ({ content: "draft", title: "a" }))
		const remap = workspace.commands.renameTab("/notes/source", "/notes/moved")
		const save = workspace.commands.requestDocumentSave(doc.documentId)
		await waitForAssertion(() =>
			expect(readDocument).toHaveBeenCalledWith("/notes/moved/a.md"),
		)
		expect(writeDocument).not.toHaveBeenCalled()
		movedRead.resolve({ content: "original", revision: "moved" })
		await remap
		expect(await save).toBe(true)
		expect(writeDocument).toHaveBeenCalledExactlyOnceWith({
			path: "/notes/moved/a.md",
			content: "draft",
			expectedRevision: "moved",
		})
	})
})
