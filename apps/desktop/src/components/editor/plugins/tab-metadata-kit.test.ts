import { KEYS } from "@mdit/editor/plate"
import { beforeEach, describe, expect, it, vi } from "vitest"

let storeState = {
	workspacePath: "/workspace",
	tab: { path: "/workspace/note.md" },
	linkedTab: { path: "/workspace/note.md", name: "Title" },
	updateLinkedName: vi.fn(),
}

vi.mock("@/store", () => ({
	useStore: {
		getState: () => storeState,
	},
}))

import {
	getNextLinkedTabName,
	shouldSyncLinkedTabName,
	syncLinkedTabName,
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
			tab: { path: "/workspace/note.md" },
			linkedTab: { path: "/workspace/note.md", name: "Title" },
			updateLinkedName: vi.fn(),
		}
	})

	it("skips selection-only changes when the first heading text is unchanged", () => {
		const editor = createEditor({ firstBlock: createHeading("Title") })

		expect(shouldSyncLinkedTabName(editor)).toBe("Title")
		editor.selection!.focus.path = [0, 0]

		expect(shouldSyncLinkedTabName(editor)).toBeNull()
	})

	it("returns a new linked tab name when the first heading text changes", () => {
		const editor = createEditor({ firstBlock: createHeading("Title") })

		expect(shouldSyncLinkedTabName(editor)).toBe("Title")
		editor.children[0] = createHeading("Renamed title")

		expect(shouldSyncLinkedTabName(editor)).toBe("Renamed title")
	})

	it("does not cache the heading before selection is available", () => {
		const editor = createEditor({ firstBlock: createHeading("Title") })
		editor.selection = null

		expect(shouldSyncLinkedTabName(editor)).toBeNull()
		editor.selection = { focus: { path: [0] } }

		expect(shouldSyncLinkedTabName(editor)).toBe("Title")
	})

	it("ignores edits outside the first block", () => {
		const editor = createEditor({
			firstBlock: createHeading("Title"),
			secondBlock: createParagraph("Body"),
		})

		expect(shouldSyncLinkedTabName(editor)).toBe("Title")
		editor.children[1] = createParagraph("Body updated")

		expect(shouldSyncLinkedTabName(editor)).toBeNull()
	})

	it("does not sync when the first block is not a heading", () => {
		const editor = createEditor({ firstBlock: createParagraph("Title") })

		expect(getNextLinkedTabName(editor, storeState)).toBeNull()
	})

	it("does not sync when the first heading is cleared", () => {
		const editor = createEditor({ firstBlock: createHeading("Title") })

		syncLinkedTabName(editor, storeState)
		editor.children[0] = createHeading("")

		expect(getNextLinkedTabName(editor, storeState)).toBeNull()
		syncLinkedTabName(editor, storeState)

		expect(storeState.updateLinkedName).not.toHaveBeenCalled()
	})

	it("does not sync when the tab is not linked to the current note", () => {
		const editor = createEditor({ firstBlock: createHeading("Renamed title") })

		storeState = {
			...storeState,
			linkedTab: { path: "/workspace/other.md", name: "Other" },
		}

		expect(getNextLinkedTabName(editor, storeState)).toBeNull()
	})
})
