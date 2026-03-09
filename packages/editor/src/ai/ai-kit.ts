import { withAIBatch } from "@platejs/ai"
import {
	AIChatPlugin,
	AIPlugin,
	streamInsertChunk,
	useChatChunk,
} from "@platejs/ai/react"
import { getPluginType, KEYS, PathApi } from "platejs"
import { usePluginOption } from "platejs/react"
import { AILoadingBar } from "../ai/ai-loading-bar"
import { createAIMenu } from "../ai/ai-menu"
import type { AIMenuHostDeps } from "../ai/ai-menu.types"
import { applyChatSelectionSuggestions } from "../ai/apply-chat-selection-suggestions"
import { AIAnchorElement, AILeaf } from "../ai/node-ai"

export type {
	AIMenuCommand,
	AIMenuHostDeps,
	AIMenuRuntime,
	AIMenuStorage,
	EditorChatState,
} from "../ai/ai-menu.types"

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
							withAIBatch(
								editor,
								() => {
									applyChatSelectionSuggestions(editor, text, getOption)
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
