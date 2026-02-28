import { type UseChatHelpers, useChat as useBaseChat } from "@ai-sdk/react"
import {
	buildProviderRequestOptions,
	type ChatProviderId,
	createModelFromChatConfig,
	getEditorChatPromptTemplate,
	getEditorChatSystemPrompt,
	resolveEditorChatToolName,
	type ToolName,
} from "@mdit/ai"
import { replacePlaceholders } from "@platejs/ai"
import { AIChatPlugin } from "@platejs/ai/react"
import { serializeMd } from "@platejs/markdown"
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
import { markdownJoinerTransform } from "../utils/markdown-joiner-transform"

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

export type EditorChatConfig = {
	provider: ChatProviderId
	model: string
	apiKey: string
	accountId?: string
}

type TempEditor = ReturnType<typeof createSlateEditor>

export type EditorChatHostDeps = {
	resolveActiveConfig: () => Promise<EditorChatConfig>
	codexBaseUrl: string
	fetch: typeof fetch
	onError?: (error: Error) => void
	createSessionId: () => string
	createTempEditor?: (ctx: { children: any; selection: any }) => TempEditor
}

const SELECTION_START = "<Selection>"
const SELECTION_END = "</Selection>"

const addSelection = (editor: TempEditor) => {
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

const removeEscapeSelection = (editor: TempEditor, text: string) => {
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
	editor: TempEditor,
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

const createDefaultTempEditor = ({
	children,
	selection,
}: {
	children: any
	selection: any
}): TempEditor =>
	createSlateEditor({
		selection,
		value: children,
	})

export const useEditorChat = (host: EditorChatHostDeps): Chat => {
	const editor = useEditorRef()
	const sessionIdRef = useRef(host.createSessionId())

	const chat = useBaseChat<ChatMessage>({
		id: "editor",
		transport: new DefaultChatTransport({
			fetch: async (_, init) => {
				const activeConfig = await host.resolveActiveConfig()
				const model = createModelFromChatConfig(activeConfig, {
					codex: {
						baseURL: host.codexBaseUrl,
						fetch: host.fetch,
						createSessionId: () => sessionIdRef.current,
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
				const tempEditor = (host.createTempEditor ?? createDefaultTempEditor)({
					children,
					selection,
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
		onData(data: any) {
			if (data.type === "data-toolName") {
				editor.setOption(AIChatPlugin, "toolName", data.data)
			}
		},
		onError(error: Error) {
			host.onError?.(error)
		},
	})

	// biome-ignore lint/correctness/useExhaustiveDependencies: true
	useEffect(() => {
		editor.setOption(AIChatPlugin, "chat", chat)
	}, [chat.status, chat.messages, chat.error])

	return chat
}
