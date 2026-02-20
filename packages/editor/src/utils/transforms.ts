import { insertCallout } from "@platejs/callout"
import { insertCodeBlock, toggleCodeBlock } from "@platejs/code-block"
import { insertDate } from "@platejs/date"
import { insertColumnGroup, toggleColumnGroup } from "@platejs/layout"
import { triggerFloatingLink } from "@platejs/link/react"
import { insertEquation, insertInlineEquation } from "@platejs/math"
import {
	insertAudioPlaceholder,
	insertFilePlaceholder,
	insertMedia,
	insertVideoPlaceholder,
} from "@platejs/media"
import { TablePlugin } from "@platejs/table/react"
import { insertToc } from "@platejs/toc"
import {
	KEYS,
	type NodeEntry,
	type Path,
	PathApi,
	type TElement,
} from "platejs"
import type { PlateEditor } from "platejs/react"

// import { DATABASE_KEY } from "../plugins/database-kit"

const ACTION_THREE_COLUMNS = "action_three_columns"

const insertList = (editor: PlateEditor, type: string) => {
	editor.tf.insertNodes(
		editor.api.create.block({
			indent: 1,
			listStyleType: type,
			checked: type === KEYS.listTodo ? false : undefined,
		}),
		{ select: true },
	)
}

const insertBlockMap: Record<
	string,
	(editor: PlateEditor, type: string) => void
> = {
	[KEYS.listTodo]: insertList,
	[KEYS.ol]: insertList,
	[KEYS.ul]: insertList,
	[ACTION_THREE_COLUMNS]: (editor) =>
		insertColumnGroup(editor, { columns: 3, select: true }),
	[KEYS.audio]: (editor) => insertAudioPlaceholder(editor, { select: true }),
	[KEYS.callout]: (editor) => insertCallout(editor, { select: true }),
	[KEYS.codeBlock]: (editor) => insertCodeBlock(editor, { select: true }),
	[KEYS.equation]: (editor) => insertEquation(editor, { select: true }),
	[KEYS.file]: (editor) => insertFilePlaceholder(editor, { select: true }),
	[KEYS.img]: (editor) =>
		insertMedia(editor, {
			select: true,
			type: KEYS.img,
		}),
	[KEYS.mediaEmbed]: (editor) =>
		insertMedia(editor, {
			select: true,
			type: KEYS.mediaEmbed,
		}),
	[KEYS.table]: (editor) => {
		const block = editor.api.block()
		if (block) {
			editor.getTransforms(TablePlugin).insert.table(
				{},
				{
					at: block[1],
					select: true,
				},
			)
		} else {
			editor.getTransforms(TablePlugin).insert.table({}, { select: true })
		}
	},
	[KEYS.toc]: (editor) => insertToc(editor, { select: true }),
	[KEYS.video]: (editor) => insertVideoPlaceholder(editor, { select: true }),
	// [DATABASE_KEY]: (editor) => {
	// 	editor.tf.insertNodes(editor.api.create.block({ type: DATABASE_KEY }), {
	// 		select: true,
	// 	})
	// },
}

const insertInlineMap: Record<
	string,
	(editor: PlateEditor, type: string) => void
> = {
	[KEYS.date]: (editor) => insertDate(editor, { select: true }),
	[KEYS.inlineEquation]: (editor) =>
		insertInlineEquation(editor, "", { select: true }),
	[KEYS.link]: (editor) => triggerFloatingLink(editor, { focused: true }),
}

export const insertBlock = (editor: PlateEditor, type: string) => {
	editor.tf.withoutNormalizing(() => {
		const block = editor.api.block()

		if (!block) return
		if (type in insertBlockMap) {
			insertBlockMap[type](editor, type)
		} else {
			editor.tf.insertNodes(editor.api.create.block({ type }), {
				at: PathApi.next(block[1]),
				select: true,
			})
		}
		if (getBlockType(block[0]) !== type) {
			editor.tf.removeNodes({ previousEmptyBlock: true })
		}
	})
}

export const insertInlineElement = (editor: PlateEditor, type: string) => {
	if (insertInlineMap[type]) {
		insertInlineMap[type](editor, type)
	}
}

const setList = (
	editor: PlateEditor,
	type: string,
	entry: NodeEntry<TElement>,
) => {
	editor.tf.setNodes(
		editor.api.create.block({
			indent: 1,
			listStyleType: type,
		}),
		{
			at: entry[1],
		},
	)
}

const setBlockMap: Record<
	string,
	(editor: PlateEditor, type: string, entry: NodeEntry<TElement>) => void
> = {
	[KEYS.listTodo]: setList,
	[KEYS.ol]: setList,
	[KEYS.ul]: setList,
	[ACTION_THREE_COLUMNS]: (editor) => toggleColumnGroup(editor, { columns: 3 }),
	[KEYS.codeBlock]: (editor) => toggleCodeBlock(editor),
}

export const setBlockType = (
	editor: PlateEditor,
	type: string,
	{ at }: { at?: Path } = {},
) => {
	editor.tf.withoutNormalizing(() => {
		const setEntry = (entry: NodeEntry<TElement>) => {
			const [node, path] = entry

			if (node[KEYS.listType]) {
				editor.tf.unsetNodes([KEYS.listType, "indent"], { at: path })
			}
			if (type in setBlockMap) {
				return setBlockMap[type](editor, type, entry)
			}
			if (node.type !== type) {
				editor.tf.setNodes({ type }, { at: path })
			}
		}

		if (at) {
			const entry = editor.api.node<TElement>(at)

			if (entry) {
				setEntry(entry)

				return
			}
		}

		const entries = editor.api.blocks({ mode: "lowest" })

		for (const entry of entries) {
			setEntry(entry)
		}
	})
}

export const getBlockType = (block: TElement) => {
	if (block[KEYS.listType]) {
		if (block[KEYS.listType] === KEYS.ol) {
			return KEYS.ol
		}
		if (block[KEYS.listType] === KEYS.listTodo) {
			return KEYS.listTodo
		}
		return KEYS.ul
	}

	return block.type
}
