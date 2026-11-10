import { describe, expect, it, vi } from "vitest"
import {
	createWorkspaceRuntime,
	type WorkspaceRuntimeDependencies,
} from "./workspace-runtime"

const makeDocumentCommands = (
	closeAllTabs = async () => true,
): WorkspaceRuntimeDependencies["documents"] => ({
	getActiveTabPath: () => null,
	getOpenDocumentSnapshots: () => [],
	getDocumentById: () => null,
	flushDocumentsUnderPaths: async () => true,
	closeAllTabs,
	openTab: async () => {},
	hydrateFromOpenedFiles: async () => true,
	reserveDocumentRename: () => () => {},
	renameTab: async () => {},
	refreshTabFromExternalContent: async () => {},
	removePathsFromHistory: () => {},
})

function makeRuntime(overrides: Partial<WorkspaceRuntimeDependencies> = {}) {
	return createWorkspaceRuntime({
		migrate: async () => {},
		watcher: {
			start: async () => {},
			stop: async () => {},
			subscribe: async () => () => {},
		},
		documents: makeDocumentCommands(),
		fileSystem: {
			exists: async () => false,
			isExistingDirectory: async () => true,
			readDir: async (path) => [
				{ name: `${path.slice(1)}.md`, isDirectory: false },
			],
			stat: async () => ({ isDirectory: false }),
			readTextFile: async () => "",
			writeTextFile: async () => {},
			mkdir: async () => {},
			rename: async () => {},
			copy: async () => {},
			moveToTrash: async () => {},
			moveManyToTrash: async () => {},
		},
		readDocument: async () => null,
		createDocument: async () => true,
		settings: {
			loadSettings: async () => ({}),
			saveSettings: async () => {},
		},
		history: {
			listWorkspacePaths: async () => [],
			touchWorkspace: async () => {},
			removeWorkspace: async () => {},
		},
		openFolder: async () => null,
		toast: { error: vi.fn() },
		...overrides,
	})
}

describe("workspace runtime", () => {
	it("finishes the opening session before applying the next workspace request", async () => {
		let releaseMigration!: () => void
		const pendingMigration = new Promise<void>((resolve) => {
			releaseMigration = resolve
		})
		const migrate = vi.fn(async () => {}).mockReturnValueOnce(pendingMigration)
		const startWatcher = vi.fn(async () => {})
		const closeAllTabs = vi.fn(async () => true)
		const runtime = makeRuntime({
			migrate,
			watcher: {
				start: startWatcher,
				stop: async () => {},
				subscribe: async () => () => {},
			},
			documents: makeDocumentCommands(closeAllTabs),
		})

		const opening = runtime.commands.setWorkspace("/first")
		await vi.waitFor(() => expect(migrate).toHaveBeenCalledWith("/first"))
		const next = runtime.commands.setWorkspace("/next")
		await Promise.resolve()
		expect(closeAllTabs).toHaveBeenCalledTimes(1)
		releaseMigration()
		await Promise.all([opening, next])

		expect(runtime.getSnapshot()).toMatchObject({
			workspacePath: "/next",
			sessionId: 2,
			isTreeLoading: false,
			entries: [{ path: "/next/next.md" }],
		})
		expect(startWatcher).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ workspacePath: "/first" }),
		)
		expect(startWatcher).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ workspacePath: "/next" }),
		)

		closeAllTabs.mockResolvedValueOnce(false)
		await runtime.commands.setWorkspace("/blocked")
		expect(runtime.getSnapshot().workspacePath).toBe("/next")
		expect(startWatcher).toHaveBeenCalledTimes(2)
		await runtime.dispose()
	})

	it("retries an occupied filename when two notes are created concurrently", async () => {
		const files = new Map<string, string>()
		const createDocument = vi.fn(async (path: string, content: string) => {
			if (files.has(path)) {
				return false
			}
			files.set(path, content)
			return true
		})
		const runtime = makeRuntime({ createDocument })
		await runtime.commands.setWorkspace("/vault")

		const paths = await Promise.all([
			runtime.commands.createNote("/vault", { initialContent: "one" }),
			runtime.commands.createNote("/vault", { initialContent: "two" }),
		])

		expect(paths).toEqual(["/vault/Untitled.md", "/vault/Untitled 1.md"])
		expect([...files.values()]).toEqual(["one", "two"])
		expect(createDocument.mock.calls).toEqual([
			["/vault/Untitled.md", "one"],
			["/vault/Untitled.md", "two"],
			["/vault/Untitled 1.md", "two"],
		])
		await runtime.dispose()
	})

	it("keeps workspace switching in the main window runtime", async () => {
		const openFolder = vi.fn(async () => "/vault")
		const migrate = vi.fn(async () => {})
		const runtime = makeRuntime({ mode: "detached", openFolder, migrate })

		await runtime.commands.openFolderPicker()
		await runtime.commands.setWorkspace("/vault")

		expect(openFolder).toHaveBeenCalledOnce()
		expect(migrate).not.toHaveBeenCalled()
		expect(runtime.getSnapshot().workspacePath).toBeNull()
		await runtime.dispose()
	})
})
