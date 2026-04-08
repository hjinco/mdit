import { KEYS } from "@mdit/editor/plate"
import { beforeEach, describe, expect, it, vi } from "vitest"

type StoreState = {
	workspacePath: string | null
	getDocumentById: (
		documentId: number,
	) => { path: string; syncedName?: string | null } | null
	setDocumentSyncedName: (documentId: number, name: string) => void
}

let storeState: StoreState = {
	workspacePath: "/workspace",
	getDocumentById: () => ({
		path: "/workspace/note.md",
		syncedName: "Title",
	}),
	setDocumentSyncedName: vi.fn<(documentId: number, name: string) => void>(),
}

vi.mock("@/store", () => ({
	useStore: {
		getState: () => storeState,
	},
}))

import {
	getNextTabSyncedName,
	shouldSyncTabNameFromHeading,
	syncTabSyncedName,
} from "./tab-metadata-kit"

type MockEditor = {
	children: unknown[]
	selection: { focus: { path: number[] } } | null
	api: {
		isBlock: () => boolean
		above: ({ at }: { at: { path: number[] } }) => readonly [null, number[]]
	}
}

function createEditor({
	firstBlock,
	secondBlock,
	focusPath = [0],
}: {
	firstBlock: unknown
	secondBlock?: unknown
	focusPath?: number[]
}): MockEditor {
	const children = secondBlock ? [firstBlock, secondBlock] : [firstBlock]

	return {
		children,
		selection: { focus: { path: focusPath } },
		api: {
			isBlock: () => true,
			above: ({ at }: { at: { path: number[] } }) => [null, at.path] as const,
		},
	}
}

function createHeading(text: string) {
	return {
		type: KEYS.heading[0],
		children: [{ text }],
	}
}

function createParagraph(text: string) {
	return {
		type: KEYS.p,
		children: [{ text }],
	}
}

describe("tab-metadata-kit", () => {
	beforeEach(() => {
		storeState = {
			workspacePath: "/workspace",
			getDocumentById: () => ({
				path: "/workspace/note.md",
				syncedName: "Title",
			}),
			setDocumentSyncedName:
				vi.fn<(documentId: number, name: string) => void>(),
		}
	})

	it("skips selection-only changes when the first heading text is unchanged", () => {
		const editor = createEditor({ firstBlock: createHeading("Title") })

		expect(shouldSyncTabNameFromHeading(editor)).toBe("Title")
		editor.selection!.focus.path = [0, 0]

		expect(shouldSyncTabNameFromHeading(editor)).toBeNull()
	})

	it("returns a new synced tab name when the first heading text changes", () => {
		const editor = createEditor({ firstBlock: createHeading("Title") })

		expect(shouldSyncTabNameFromHeading(editor)).toBe("Title")
		editor.children[0] = createHeading("Renamed title")

		expect(shouldSyncTabNameFromHeading(editor)).toBe("Renamed title")
	})

	it("does not cache the heading before selection is available", () => {
		const editor = createEditor({ firstBlock: createHeading("Title") })
		editor.selection = null

		expect(shouldSyncTabNameFromHeading(editor)).toBeNull()
		editor.selection = { focus: { path: [0] } }

		expect(shouldSyncTabNameFromHeading(editor)).toBe("Title")
	})

	it("ignores edits outside the first block", () => {
		const editor = createEditor({
			firstBlock: createHeading("Title"),
			secondBlock: createParagraph("Body"),
		})

		expect(shouldSyncTabNameFromHeading(editor)).toBe("Title")
		editor.children[1] = createParagraph("Body updated")

		expect(shouldSyncTabNameFromHeading(editor)).toBeNull()
	})

	it("does not sync when the first block is not a heading", () => {
		const editor = createEditor({ firstBlock: createParagraph("Title") })

		expect(getNextTabSyncedName(editor, 1, storeState)).toBeNull()
	})

	it("does not sync when the first heading is cleared", () => {
		const editor = createEditor({ firstBlock: createHeading("Title") })

		syncTabSyncedName(editor, 1, storeState)
		editor.children[0] = createHeading("")

		expect(getNextTabSyncedName(editor, 1, storeState)).toBeNull()
		syncTabSyncedName(editor, 1, storeState)

		expect(storeState.setDocumentSyncedName).not.toHaveBeenCalled()
	})

	it("does not sync when the tab has no synced name for the current note", () => {
		const editor = createEditor({ firstBlock: createHeading("Renamed title") })

		storeState = {
			...storeState,
			getDocumentById: () => ({ path: "/workspace/note.md", syncedName: null }),
		}

		expect(getNextTabSyncedName(editor, 1, storeState)).toBeNull()
	})
})
