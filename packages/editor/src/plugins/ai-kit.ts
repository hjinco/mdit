import { withAIBatch } from "@platejs/ai"
import {
	AIChatPlugin,
	AIPlugin,
	applyAISuggestions,
	streamInsertChunk,
	useChatChunk,
} from "@platejs/ai/react"
import { ElementApi, getPluginType, KEYS, PathApi } from "platejs"
import { usePluginOption } from "platejs/react"
import { AILoadingBar } from "../components/ai-loading-bar"
import { createAIMenu } from "../components/ai-menu"
import type { AIMenuHostDeps } from "../components/ai-menu.types"
import { AIAnchorElement, AILeaf } from "../nodes/node-ai"

export type {
	AIMenuCommand,
	AIMenuHostDeps,
	AIMenuRuntime,
	AIMenuStorage,
	EditorChatState,
} from "../components/ai-menu.types"

export const createAIKit = ({ host }: { host: AIMenuHostDeps }) => {
	const AIMenu = createAIMenu(host)

	return [
		AIPlugin.withComponent(AILeaf),
		AIChatPlugin.extend({
			render: {
				afterContainer: AILoadingBar,
				afterEditable: AIMenu,
				node: AIAnchorElement,
			},
			shortcuts: { show: { keys: "mod+j" } },
			useHooks: ({ editor, getOption }) => {
				const mode = usePluginOption(AIChatPlugin, "mode")
				const toolName = usePluginOption(AIChatPlugin, "toolName")

				useChatChunk({
					onChunk: ({ chunk, isFirst, text }) => {
						if (mode === "insert") {
							if (isFirst) {
								editor.setOption(AIChatPlugin, "streaming", true)

								editor.tf.insertNodes(
									{
										children: [{ text: "" }],
										type: getPluginType(editor, KEYS.aiChat),
									},
									{
										at: PathApi.next(editor.selection!.focus.path.slice(0, 1)),
									},
								)
							}

							if (!getOption("streaming")) return

							withAIBatch(
								editor,
								() => {
									streamInsertChunk(editor, chunk, {
										textProps: {
											[getPluginType(editor, KEYS.ai)]: true,
										},
									})
								},
								{ split: isFirst },
							)
						}

						if (toolName === "edit" && mode === "chat") {
							const chatSelection = getOption("chatSelection")
							if (chatSelection) {
								editor.tf.setSelection(chatSelection)
							} else {
								const chatNodes = getOption("chatNodes")
								const chatNodeIds = Array.isArray(chatNodes)
									? chatNodes
											.map((node) => node?.id)
											.filter((id): id is string => typeof id === "string")
									: []

								if (chatNodeIds.length > 0) {
									const selectedNodes = Array.from(
										editor.api.nodes({
											at: [],
											match: (node) =>
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
							}

							withAIBatch(
								editor,
								() => {
									applyAISuggestions(editor, text)
								},
								{ split: isFirst },
							)
						}
					},
					onFinish: () => {
						editor.setOption(AIChatPlugin, "streaming", false)
						editor.setOption(AIChatPlugin, "_blockChunks", "")
						editor.setOption(AIChatPlugin, "_blockPath", null)
						editor.setOption(AIChatPlugin, "_mdxName", null)
					},
				})
			},
		}),
	]
}
