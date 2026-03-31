import { createPlatePlugin, KEYS } from "@mdit/editor/plate"
import { sanitizeFilename } from "@mdit/utils/path-utils"
import { useStore } from "@/store"

const firstBlockTextByEditor = new WeakMap<object, string | null>()

type TabNameSyncStoreState = {
	workspacePath: string | null
	tab: { path: string } | null
	linkedTab: { path: string; name: string } | null
}

/**
 * Extract text content from a Slate node by traversing its children
 */
function extractTextFromNode(node: any): string {
	if (typeof node === "string") {
		return node
	}
	if (node.text) {
		return node.text
	}
	if (Array.isArray(node.children)) {
		return node.children.map(extractTextFromNode).join("")
	}
	return ""
}

function isHeadingType(type: string) {
	return KEYS.heading.includes(type)
}

function getTrackedFirstBlockText(blocks: any): string | null {
	if (!Array.isArray(blocks) || blocks.length === 0) {
		return null
	}

	const firstBlock = blocks[0]
	if (!firstBlock || !isHeadingType(firstBlock.type)) {
		return null
	}

	return extractTextFromNode(firstBlock) || null
}

export function shouldSyncLinkedTabName(editor: any): string | null {
	const nextTrackedText = getTrackedFirstBlockText(editor.children)

	if (nextTrackedText === null || !editor.selection) {
		return null
	}

	const focusBlock = editor.api.above({
		at: editor.selection.focus,
		match: editor.api.isBlock,
		mode: "highest",
	})

	if (!focusBlock) {
		return null
	}

	const [, focusPath] = focusBlock

	if (focusPath.length !== 1 || focusPath[0] !== 0) {
		return null
	}

	const previousTrackedText = firstBlockTextByEditor.get(editor) ?? null
	if (previousTrackedText === nextTrackedText) {
		return null
	}

	firstBlockTextByEditor.set(editor, nextTrackedText)

	return sanitizeFilename(nextTrackedText)
}

export function getNextLinkedTabName(
	editor: any,
	storeState: TabNameSyncStoreState,
) {
	if (!storeState.workspacePath) {
		return null
	}

	const { tab, linkedTab } = storeState
	const isLinkedToCurrentTab = tab && linkedTab && linkedTab.path === tab.path

	if (!isLinkedToCurrentTab) {
		return null
	}

	const firstHeading = shouldSyncLinkedTabName(editor)
	if (firstHeading === null || firstHeading === linkedTab.name) {
		return null
	}

	return firstHeading
}

export function syncLinkedTabName(
	editor: any,
	storeState: TabNameSyncStoreState & {
		updateLinkedName: (name: string) => void
	},
) {
	const firstHeading = getNextLinkedTabName(editor, storeState)
	if (firstHeading === null) {
		return
	}

	storeState.updateLinkedName(firstHeading)
}

const TabMetadataPlugin = createPlatePlugin({
	key: "tabMetadata",
	handlers: {
		onChange: ({ editor }) => {
			syncLinkedTabName(editor, useStore.getState())
		},
	},
})

export const TabMetadataKit = [TabMetadataPlugin]
