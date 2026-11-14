import { describe, expect, it, vi } from "vitest"
import { handleExplorerEntryPrimaryAction } from "./use-entry-primary-action"

vi.mock("@/components/file-explorer/utils/file-manager", () => ({
	revealInFileManager: vi.fn(),
}))

const createDeps = () => ({
	handleItemPress: vi.fn(),
	openTab: vi.fn(),
	openTabInNewTab: vi.fn(),
	openImagePreview: vi.fn(),
	toggleExpanded: vi.fn(),
})

const createEvent = (
	overrides: Partial<{
		altKey: boolean
		ctrlKey: boolean
		metaKey: boolean
		shiftKey: boolean
	}> = {},
) => ({
	altKey: false,
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	stopPropagation: vi.fn(),
	...overrides,
})

describe("handleExplorerEntryPrimaryAction", () => {
	it("opens markdown notes in the current tab on plain click", () => {
		const deps = createDeps()
		const event = createEvent()

		handleExplorerEntryPrimaryAction(
			{ path: "/notes/a.md", name: "a.md", isDirectory: false },
			event,
			deps,
		)

		expect(event.stopPropagation).toHaveBeenCalledOnce()
		expect(deps.handleItemPress).toHaveBeenCalledWith("/notes/a.md", {
			shiftKey: false,
			metaKey: false,
			ctrlKey: false,
			altKey: false,
		})
		expect(deps.openTab).toHaveBeenCalledWith("/notes/a.md")
		expect(deps.openTabInNewTab).not.toHaveBeenCalled()
	})

	it("opens markdown notes in a new tab on meta click", () => {
		const deps = createDeps()
		const event = createEvent({ metaKey: true })

		handleExplorerEntryPrimaryAction(
			{ path: "/notes/a.md", name: "a.md", isDirectory: false },
			event,
			deps,
		)

		expect(deps.handleItemPress).toHaveBeenCalledWith("/notes/a.md", {
			shiftKey: false,
			metaKey: false,
			ctrlKey: false,
			altKey: false,
		})
		expect(deps.openTabInNewTab).toHaveBeenCalledWith("/notes/a.md")
		expect(deps.openTab).not.toHaveBeenCalled()
	})

	it("opens markdown notes in a new tab on ctrl click", () => {
		const deps = createDeps()
		const event = createEvent({ ctrlKey: true })

		handleExplorerEntryPrimaryAction(
			{ path: "/notes/a.md", name: "a.md", isDirectory: false },
			event,
			deps,
		)

		expect(deps.handleItemPress).toHaveBeenCalledWith("/notes/a.md", {
			shiftKey: false,
			metaKey: false,
			ctrlKey: false,
			altKey: false,
		})
		expect(deps.openTabInNewTab).toHaveBeenCalledWith("/notes/a.md")
		expect(deps.openTab).not.toHaveBeenCalled()
	})

	it("keeps shift click as range selection without opening a tab", () => {
		const deps = createDeps()
		const event = createEvent({ shiftKey: true })

		handleExplorerEntryPrimaryAction(
			{ path: "/notes/a.md", name: "a.md", isDirectory: false },
			event,
			deps,
		)

		expect(deps.handleItemPress).toHaveBeenCalledWith("/notes/a.md", {
			shiftKey: true,
			metaKey: false,
			ctrlKey: false,
			altKey: false,
		})
		expect(deps.openTab).not.toHaveBeenCalled()
		expect(deps.openTabInNewTab).not.toHaveBeenCalled()
	})

	it("uses alt click for toggle selection on markdown notes", () => {
		const deps = createDeps()
		const event = createEvent({ altKey: true })

		handleExplorerEntryPrimaryAction(
			{ path: "/notes/a.md", name: "a.md", isDirectory: false },
			event,
			deps,
		)

		expect(deps.handleItemPress).toHaveBeenCalledWith("/notes/a.md", {
			shiftKey: false,
			metaKey: false,
			ctrlKey: false,
			altKey: true,
		})
		expect(deps.openTab).not.toHaveBeenCalled()
		expect(deps.openTabInNewTab).not.toHaveBeenCalled()
	})

	it("uses alt click for toggle selection on directories", () => {
		const deps = createDeps()
		const event = createEvent({ altKey: true })

		handleExplorerEntryPrimaryAction(
			{ path: "/notes/folder", name: "folder", isDirectory: true },
			event,
			deps,
		)

		expect(deps.handleItemPress).toHaveBeenCalledWith("/notes/folder", {
			shiftKey: false,
			metaKey: false,
			ctrlKey: false,
			altKey: true,
		})
		expect(deps.toggleExpanded).not.toHaveBeenCalled()
		expect(deps.openTabInNewTab).not.toHaveBeenCalled()
	})

	it("uses alt click for toggle selection on non-markdown files", () => {
		const deps = createDeps()
		const event = createEvent({ altKey: true })

		handleExplorerEntryPrimaryAction(
			{ path: "/notes/data.json", name: "data.json", isDirectory: false },
			event,
			deps,
		)

		expect(deps.handleItemPress).toHaveBeenCalledWith("/notes/data.json", {
			shiftKey: false,
			metaKey: false,
			ctrlKey: false,
			altKey: true,
		})
		expect(deps.openTab).not.toHaveBeenCalled()
		expect(deps.openTabInNewTab).not.toHaveBeenCalled()
		expect(deps.openImagePreview).not.toHaveBeenCalled()
	})
})
