import { KEYS, type Path } from "platejs"

export type CreateLinkedNotesFromListItemsResult = {
	wikiTarget: string
	linkText: string
} | null

export type CreateLinkedNotesFromListItemsHandler = (
	items: string[],
) => Promise<CreateLinkedNotesFromListItemsResult[]>

export type BlockSelectionNodeEntry = [Record<string, unknown>, Path]

export function getListSelectionNodes(
	selectionNodes: BlockSelectionNodeEntry[],
): BlockSelectionNodeEntry[] | null {
	if (selectionNodes.length === 0) {
		return null
	}

	if (
		!selectionNodes.every(([node]) => {
			return Boolean(node[KEYS.listType])
		})
	) {
		return null
	}

	return selectionNodes
}

export function buildLinkedNoteNode({
	node,
	linkType,
	wikiTarget,
	linkText,
	fallbackText,
}: {
	node: Record<string, unknown>
	linkType: string
	wikiTarget: string
	linkText: string
	fallbackText: string
}) {
	const trimmedWikiTarget = wikiTarget.trim()
	if (!trimmedWikiTarget) {
		return null
	}

	const nextLinkText = linkText.trim() || fallbackText || trimmedWikiTarget

	return {
		...node,
		children: [
			{
				type: linkType,
				url: trimmedWikiTarget,
				wiki: true,
				wikiTarget: trimmedWikiTarget,
				children: [{ text: nextLinkText }],
			},
			{ text: "" },
		],
	}
}
