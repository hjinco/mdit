import { describe, expect, it, vi } from "vitest"
import type { DiskDocument } from "../documents/types"
import type { WorkspaceEntry } from "./types"
import { createWorkspaceWatchRuntime } from "./watch"
import type {
	VaultWatchBatchPayload,
	VaultWatchOp,
	WorkspaceWatchDependencies,
	WorkspaceWatchLease,
} from "./watch-types"

const note = { path: "/vault/note.md", diskRevision: "before", sessionEpoch: 0 }
const documentSnapshot = { documentId: 1, path: note.path, isSaved: false }
const fileChanged = {
	type: "pathState",
	relPath: "note.md",
	before: "file",
	after: "file",
} satisfies VaultWatchOp

const createTestRuntime = () => {
	const listeners: ((payload: VaultWatchBatchPayload) => void)[] = []
	const deps = {
		watcher: {
			start: vi.fn(async (_lease: WorkspaceWatchLease) => {}),
			stop: vi.fn(async (_lease: WorkspaceWatchLease) => {}),
			subscribe: vi.fn(
				async (listener: (payload: VaultWatchBatchPayload) => void) => {
					listeners.push(listener)
					return vi.fn()
				},
			),
		},
		originJournal: {
			resolve: vi.fn(({ relPaths }: { relPaths: string[] }) => ({
				externalRelPaths: relPaths,
				localRelPaths: [] as string[],
			})),
			clearWorkspace: vi.fn(),
		},
		fileSystem: {
			exists: vi.fn(async () => false),
			isExistingDirectory: vi.fn(async () => false),
			stat: vi.fn(async () => ({ isDirectory: false })),
		},
		readDocument: vi.fn(
			async (_path: string): Promise<DiskDocument | null> => ({
				content: "from disk",
				revision: "external",
			}),
		),
		tree: {
			getEntryByPath: vi.fn((_path: string): WorkspaceEntry | null => null),
			readWorkspaceEntriesFromPath: vi.fn(async () => []),
			refreshWorkspaceEntries: vi.fn(async () => {}),
			reconcileDirectoryEntries: vi.fn(async () => {}),
			entryCreated: vi.fn(async () => {}),
			entriesDeleted: vi.fn(async () => {}),
			entryRenamed: vi.fn(async () => {}),
			entryMoved: vi.fn(async () => {}),
			updateEntryModifiedDate: vi.fn(async () => {}),
		},
		documents: {
			getOpenDocumentSnapshots: vi.fn(() => [documentSnapshot]),
			getDocumentById: vi.fn((_id: number) => note),
			refreshTabFromExternalContent: vi.fn(async () => {}),
			removePathsFromHistory: vi.fn(),
		},
		onError: vi.fn(),
	} satisfies WorkspaceWatchDependencies
	return {
		deps,
		runtime: createWorkspaceWatchRuntime(deps),
		emit: (
			listenerIndex: number,
			lease: WorkspaceWatchLease,
			seq: number,
			ops: VaultWatchOp[],
		) =>
			listeners[listenerIndex]({
				...lease,
				batch: {
					streamId: "stream",
					seqInStream: seq,
					ops,
					emittedAtUnixMs: 0,
				},
			}),
		lease: (index: number) => deps.watcher.start.mock.calls[index][0],
	}
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const deferred = <T>() => {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((done) => {
		resolve = done
	})
	return { promise, resolve }
}

describe("workspace watch runtime", () => {
	it("waits for workspace bootstrap, ignores repeated batches, and rescans on a sequence gap", async () => {
		const { deps, runtime, emit, lease } = createTestRuntime()
		const { promise: ready, resolve: finishBootstrap } = deferred<void>()
		await runtime.start({ workspacePath: "/vault", sessionId: 1, ready })
		emit(0, lease(0), 1, [fileChanged])
		emit(0, lease(0), 1, [fileChanged])
		emit(0, lease(0), 3, [fileChanged])

		await flush()
		expect(deps.readDocument).not.toHaveBeenCalled()
		finishBootstrap()
		await flush()

		expect(deps.readDocument).toHaveBeenCalledTimes(2)
		expect(deps.tree.refreshWorkspaceEntries).toHaveBeenCalledTimes(1)
	})

	it("serializes native watcher replacement and rejects delayed events for a prior lease", async () => {
		const { deps, runtime, emit, lease } = createTestRuntime()
		await runtime.start({ workspacePath: "/vault", sessionId: 1 })
		const { promise, resolve: finishStop } = deferred<void>()
		deps.watcher.stop.mockReturnValueOnce(promise)

		const reopen = runtime.start({ workspacePath: "/vault", sessionId: 2 })
		emit(0, lease(0), 1, [fileChanged])
		await flush()
		expect(deps.watcher.stop).toHaveBeenCalledWith(lease(0))
		expect(deps.watcher.start).toHaveBeenCalledTimes(1)
		expect(deps.readDocument).not.toHaveBeenCalled()

		finishStop()
		await reopen
		emit(1, lease(0), 1, [fileChanged])
		emit(1, lease(1), 1, [fileChanged])
		await flush()

		expect(deps.readDocument).toHaveBeenCalledTimes(1)
		expect(deps.documents.refreshTabFromExternalContent).toHaveBeenCalledWith(
			note.path,
			"from disk",
			expect.objectContaining({ revision: "external" }),
		)
	})

	it("compares the disk revision for an atomic write even when the path is classified as local", async () => {
		const { deps, runtime, emit, lease } = createTestRuntime()
		deps.originJournal.resolve.mockReturnValueOnce({
			externalRelPaths: [],
			localRelPaths: ["note.md"],
		})
		await runtime.start({ workspacePath: "/vault", sessionId: 1 })
		emit(0, lease(0), 1, [
			{ type: "move", fromRel: ".temp", toRel: "note.md", entryKind: "file" },
		])
		await flush()

		expect(deps.tree.reconcileDirectoryEntries).not.toHaveBeenCalled()
		expect(deps.documents.refreshTabFromExternalContent).toHaveBeenCalledWith(
			note.path,
			"from disk",
			expect.objectContaining({ revision: "external" }),
		)
	})

	it("checks the current filesystem before treating a missing event as a deletion", async () => {
		const { deps, runtime, emit, lease } = createTestRuntime()
		deps.fileSystem.exists.mockResolvedValueOnce(true)
		await runtime.start({ workspacePath: "/vault", sessionId: 1 })
		emit(0, lease(0), 1, [{ ...fileChanged, after: "missing" }])
		await flush()

		expect(deps.tree.entriesDeleted).not.toHaveBeenCalled()
		expect(deps.documents.refreshTabFromExternalContent).toHaveBeenCalled()
	})

	it("reconciles an external move over another open note without merging the drafts", async () => {
		const { deps, runtime, emit, lease } = createTestRuntime()
		const sourcePath = "/vault/source.md"
		deps.tree.getEntryByPath.mockImplementation((path) => ({
			path,
			name: path.split("/").at(-1) ?? "",
			isDirectory: false,
		}))
		deps.documents.getOpenDocumentSnapshots.mockReturnValue([
			{ documentId: 2, path: sourcePath, isSaved: false },
			documentSnapshot,
		])
		deps.documents.getDocumentById.mockImplementation((id) =>
			id === 2 ? { ...note, path: sourcePath } : note,
		)
		deps.readDocument.mockResolvedValueOnce(null)

		await runtime.start({ workspacePath: "/vault", sessionId: 1 })
		emit(0, lease(0), 1, [
			{
				type: "move",
				fromRel: "source.md",
				toRel: "note.md",
				entryKind: "file",
			},
		])
		await flush()

		expect(deps.tree.entryRenamed).not.toHaveBeenCalled()
		expect(deps.tree.reconcileDirectoryEntries).toHaveBeenCalledWith(
			["/vault"],
			expect.any(Function),
		)
		expect(deps.documents.removePathsFromHistory).toHaveBeenCalledWith(
			[sourcePath],
			{ preserveUnsaved: true },
		)
		expect(deps.documents.refreshTabFromExternalContent).toHaveBeenCalledWith(
			note.path,
			"from disk",
			expect.objectContaining({ revision: "external" }),
		)
	})

	it.each([true, false])(
		"applies an incremental rename only while the destination still exists (%s)",
		async (targetExists) => {
			const { deps, runtime, emit, lease } = createTestRuntime()
			deps.tree.getEntryByPath.mockImplementation((path) =>
				path === note.path
					? { path, name: "note.md", isDirectory: false }
					: null,
			)
			deps.fileSystem.exists.mockResolvedValueOnce(targetExists)

			await runtime.start({ workspacePath: "/vault", sessionId: 1 })
			emit(0, lease(0), 1, [
				{
					type: "move",
					fromRel: "note.md",
					toRel: "renamed.md",
					entryKind: "file",
				},
			])
			await flush()

			expect(deps.fileSystem.exists).toHaveBeenCalledWith("/vault/renamed.md")
			expect(deps.tree.entryRenamed).toHaveBeenCalledTimes(targetExists ? 1 : 0)
			expect(deps.tree.reconcileDirectoryEntries).toHaveBeenCalledTimes(
				targetExists ? 0 : 1,
			)
		},
	)

	it("ignores a watcher read if the document baseline changed while reading", async () => {
		const { deps, runtime, emit, lease } = createTestRuntime()
		const { promise, resolve: finishRead } = deferred<DiskDocument>()
		deps.readDocument.mockReturnValueOnce(promise)
		await runtime.start({ workspacePath: "/vault", sessionId: 1 })
		emit(0, lease(0), 1, [fileChanged])
		await flush()

		deps.documents.getDocumentById.mockReturnValue({
			...note,
			diskRevision: "new-save",
		})
		finishRead({ content: "stale content", revision: "external" })
		await flush()

		expect(deps.documents.refreshTabFromExternalContent).not.toHaveBeenCalled()
	})
})
