import { type UseChatHelpers, useChat as useBaseChat } from "@ai-sdk/react"
import {
	buildProviderRequestOptions,
	CODEX_BASE_URL,
	createModelFromChatConfig,
	getEditorChatPromptTemplate,
	getEditorChatSystemPrompt,
	type ToolName,
	resolveEditorChatToolName,
} from "@mdit/ai"
import { markdownJoinerTransform } from "@mdit/editor/utils/markdown-joiner-transform"
import { replacePlaceholders } from "@platejs/ai"
import { AIChatPlugin } from "@platejs/ai/react"
import { serializeMd } from "@platejs/markdown"
import { fetch as tauriHttpFetch } from "@tauri-apps/plugin-http"
import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
	DefaultChatTransport,
	streamText,
	type UIMessage,
} from "ai"
import { createSlateEditor, RangeApi } from "platejs"
import { useEditorRef } from "platejs/react"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { EditorKit } from "@/components/editor/plugins/editor-kit"
import { useStore } from "@/store"
import type { ChatConfig } from "@/store/ai-settings/ai-settings-slice"

export type { ToolName } from "@mdit/ai"
export type TComment = {
	blockId: string
	comment: string
	content: string
}
export type MessageDataPart = {
	toolName: ToolName
	comment?: TComment
}
export type Chat = UseChatHelpers<ChatMessage>
export type ChatMessage = UIMessage<{}, MessageDataPart>

const SELECTION_START = "<Selection>"
const SELECTION_END = "</Selection>"

const addSelection = (editor: ReturnType<typeof createSlateEditor>) => {
	if (!editor.selection) return

	if (editor.api.isExpanded()) {
		const [start, end] = RangeApi.edges(editor.selection)

		editor.tf.withoutNormalizing(() => {
			editor.tf.insertText(SELECTION_END, {
				at: end,
			})

			editor.tf.insertText(SELECTION_START, {
				at: start,
			})
		})
	}
}

const removeEscapeSelection = (
	editor: ReturnType<typeof createSlateEditor>,
	text: string,
) => {
	let newText = text
		.replace(`\\${SELECTION_START}`, SELECTION_START)
		.replace(`\\${SELECTION_END}`, SELECTION_END)

	// If the selection is on a void element, inserting the placeholder will fail, and the string must be replaced manually.
	if (!newText.includes(SELECTION_END)) {
		const [_, end] = RangeApi.edges(editor.selection!)

		const node = editor.api.block({ at: end.path })

		if (!node) return newText

		if (editor.api.isVoid(node[0])) {
			const voidString = serializeMd(editor, { value: [node[0]] })

			const idx = newText.lastIndexOf(voidString)

			if (idx !== -1) {
				newText =
					newText.slice(0, idx) +
					voidString.trimEnd() +
					SELECTION_END +
					newText.slice(idx + voidString.length)
			}
		}
	}

	return newText
}

const replaceMessagePlaceholders = (
	editor: ReturnType<typeof createSlateEditor>,
	message: ChatMessage,
	{ isSelecting }: { isSelecting: boolean },
): ChatMessage => {
	if (isSelecting) addSelection(editor)

	const template = getEditorChatPromptTemplate(isSelecting)

	const parts = message.parts.map((part) => {
		if (part.type !== "text" || !part.text) return part

		let text = replacePlaceholders(editor, template, {
			prompt: part.text,
		})

		if (isSelecting) text = removeEscapeSelection(editor, text)

		return { ...part, text } as typeof part
	})

	return { ...message, parts }
}

export const useChat = () => {
	const editor = useEditorRef()
	const sessionIdRef = useRef(crypto.randomUUID())

	const resolveActiveConfig = async (): Promise<ChatConfig> => {
		const currentConfig = useStore.getState().chatConfig
		if (!currentConfig) {
			throw new Error("LLM config not found")
		}
		if (currentConfig.provider !== "codex_oauth") {
			return currentConfig
		}

		await useStore.getState().refreshCodexOAuthForTarget()
		const refreshedConfig = useStore.getState().chatConfig
		if (!refreshedConfig || refreshedConfig.provider !== "codex_oauth") {
			throw new Error("Codex OAuth credential not found")
		}
		return refreshedConfig
	}

	const chat = useBaseChat<ChatMessage>({
		id: "editor",
		transport: new DefaultChatTransport({
			fetch: async (_, init) => {
				const activeConfig = await resolveActiveConfig()
				const model = createModelFromChatConfig(activeConfig, {
					codex: {
						baseURL: CODEX_BASE_URL,
						fetch: tauriHttpFetch,
						sessionId: sessionIdRef.current,
					},
				})

				const body = JSON.parse(init?.body?.toString() || "{}")
				const { ctx, messages: messagesRaw } = body
				const abortSignal = init?.signal as AbortSignal | undefined

				if (!ctx || !messagesRaw) {
					throw new Error("Missing context or messages")
				}

				const { children, selection, toolName: toolNameParam } = ctx

				// Create a temporary editor with the current state
				const tempEditor = createSlateEditor({
					plugins: EditorKit,
					selection,
					value: children,
				})

				const isSelecting = tempEditor.api.isExpanded()

				const stream = createUIMessageStream<ChatMessage>({
					execute: async ({ writer }) => {
						abortSignal?.throwIfAborted()

						const lastIndex = messagesRaw.findIndex(
							(message: ChatMessage) => message.role === "user",
						)

						const messages = [...messagesRaw]

						messages[lastIndex] = replaceMessagePlaceholders(
							tempEditor,
							messages[lastIndex],
							{
								isSelecting,
							},
						)

						const toolName = resolveEditorChatToolName({
							requestedToolName: toolNameParam,
							isSelecting,
						})
						const modelMessages = await convertToModelMessages(messages)
						const streamTextOptionsBase = {
							messages: modelMessages,
							model,
							experimental_transform: markdownJoinerTransform(),
							abortSignal,
						}

						writer.write({
							data: toolName,
							type: "data-toolName",
						})

						if (toolName === "generate") {
							const generateSystemPrompt = replacePlaceholders(
								tempEditor,
								getEditorChatSystemPrompt({
									toolName,
									isSelecting,
								}),
							)

							const gen = streamText({
								...streamTextOptionsBase,
								...buildProviderRequestOptions(
									activeConfig.provider,
									generateSystemPrompt,
								),
							})

							writer.merge(gen.toUIMessageStream({ sendFinish: false }))
						}

						if (toolName === "edit") {
							if (!isSelecting)
								throw new Error("Edit tool is only available when selecting")

							const editSystemPrompt = replacePlaceholders(
								tempEditor,
								getEditorChatSystemPrompt({
									toolName,
									isSelecting,
								}),
							)

							const edit = streamText({
								...streamTextOptionsBase,
								...buildProviderRequestOptions(
									activeConfig.provider,
									editSystemPrompt,
								),
							})

							writer.merge(edit.toUIMessageStream({ sendFinish: false }))
						}
					},
				})

				return createUIMessageStreamResponse({ stream })
			},
		}),
		onData(data) {
			if (data.type === "data-toolName") {
				editor.setOption(AIChatPlugin, "toolName", data.data)
			}
		},
		onError(error) {
			toast.error(error.message)
		},
	})

	// biome-ignore lint/correctness/useExhaustiveDependencies: true
	useEffect(() => {
		editor.setOption(AIChatPlugin, "chat", chat)
	}, [chat.status, chat.messages, chat.error])

	return chat
}
