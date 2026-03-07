import { KEYS } from "platejs"
import { createPlatePlugin } from "platejs/react"
import { FRONTMATTER_KEY } from "../frontmatter"
import { createTagLeaf, type TagHostDeps } from "./node-tag"
import { createTagDecoratedRanges } from "./tag-utils"

export const TAG_KEY = "tag"

type CreateTagKitOptions = {
	host?: TagHostDeps
}

function hasBlockedAncestor(editor: any, path: number[]) {
	const blockedTypes = new Set([
		editor.getType(KEYS.codeBlock),
		editor.getType(KEYS.link),
		editor.getType(KEYS.img),
		FRONTMATTER_KEY,
	])

	return Boolean(
		editor.api.above({
			at: path,
			match: (node: { type?: string } | null | undefined) =>
				typeof node?.type === "string" && blockedTypes.has(node.type),
			mode: "lowest",
		}),
	)
}

export function createTagPlugin({ host }: CreateTagKitOptions = {}) {
	return createPlatePlugin({
		key: TAG_KEY,
		node: {
			isLeaf: true,
		},
		decorate: ({ editor, entry }) => {
			const [node, path] = entry
			if (
				!node ||
				typeof node !== "object" ||
				typeof (node as { text?: unknown }).text !== "string"
			) {
				return
			}

			if ((node as { code?: boolean }).code) {
				return
			}

			if (hasBlockedAncestor(editor, path)) {
				return
			}

			const text = (node as { text: string }).text
			if (!text.includes("#")) {
				return
			}

			return createTagDecoratedRanges(text, [...path])
		},
	}).withComponent(createTagLeaf(host))
}

export const createTagKit = ({ host }: CreateTagKitOptions = {}) => [
	createTagPlugin({ host }),
]

export const TagKit = createTagKit()
