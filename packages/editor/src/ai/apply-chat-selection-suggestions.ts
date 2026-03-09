import {
	applyAISuggestions,
	getTableCellChildren,
	isSingleCellTable,
	rejectAISuggestions,
	withoutSuggestionAndComments,
	withTransient,
} from "@platejs/ai/react"
import { deserializeMd } from "@platejs/markdown"
import { diffToSuggestions } from "@platejs/suggestion"
import { SuggestionPlugin } from "@platejs/suggestion/react"
import { ElementApi, KEYS } from "platejs"

const hasTransientSuggestions = (editor: any) =>
	editor
		.getApi(SuggestionPlugin)
		.suggestion.node({ at: [], mode: "lowest", transient: true }) != null

const getTransientSuggestionRange = (editor: any) => {
	const transientSuggestions = editor
		.getApi(SuggestionPlugin)
		.suggestion.nodes({ at: [], mode: "lowest", transient: true })

	if (transientSuggestions.length === 0) {
		return null
	}

	return editor.api.nodesRange(transientSuggestions)
}

const restoreChatNodeSelection = (editor: any, getOption: any) => {
	const chatNodes = getOption("chatNodes")
	const chatNodeIds = Array.isArray(chatNodes)
		? chatNodes
				.map((node) => node?.id)
				.filter((id): id is string => typeof id === "string")
		: []

	if (chatNodeIds.length === 0) {
		return
	}

	const selectedNodes = Array.from(
		editor.api.nodes({
			at: [],
			match: (node: any) =>
				ElementApi.isElement(node) &&
				typeof node.id === "string" &&
				chatNodeIds.includes(node.id),
		}),
	)
	const range = editor.api.nodesRange(selectedNodes)

	if (range) {
		editor.tf.setSelection(range)
	}
}

const getChatSelectionDiffNodes = (
	editor: any,
	content: string,
	getOption: any,
) => {
	let chatNodes = withoutSuggestionAndComments(getOption("chatNodes"))

	if (isSingleCellTable(chatNodes)) {
		chatNodes = getTableCellChildren(chatNodes[0])
	}

	return withTransient(
		diffToSuggestions(editor, chatNodes, deserializeMd(editor, content), {
			ignoreProps: ["id", "listStart"],
		}),
	)
}

const selectTransientSuggestionRange = (editor: any) => {
	const transientRange = getTransientSuggestionRange(editor)

	if (transientRange) {
		editor.tf.setSelection(transientRange)
	}
}

export const applyChatSelectionSuggestions = (
	editor: any,
	content: string,
	getOption: any,
) => {
	editor
		.getApi({ key: KEYS.cursorOverlay })
		?.cursorOverlay?.removeCursor("selection")

	const chatSelection = getOption("chatSelection")
	if (!chatSelection) {
		restoreChatNodeSelection(editor, getOption)
		applyAISuggestions(editor, content)
		return
	}

	if (hasTransientSuggestions(editor)) {
		rejectAISuggestions(editor)
	}

	editor.tf.setSelection(chatSelection)
	editor.tf.insertFragment(
		getChatSelectionDiffNodes(editor, content, getOption),
	)
	selectTransientSuggestionRange(editor)
}
