import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { type UseChatHelpers, useChat as useBaseChat } from "@ai-sdk/react"
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
import { ollama } from "ollama-ai-provider-v2"
import { createSlateEditor, RangeApi } from "platejs"
import { useEditorRef, usePluginOption } from "platejs/react"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { aiChatPlugin } from "@/components/editor/plugins/ai-kit"
import { EditorKit } from "@/components/editor/plugins/editor-kit"
import type { ChatConfig } from "@/store/ai-settings/ai-settings-slice"
import { markdownJoinerTransform } from "../utils/markdown-joiner-transform"

export type ToolName = "comment" | "edit" | "generate"
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

const systemCommon = `\
You are an advanced AI-powered note-taking assistant, designed to enhance productivity and creativity in note management.
Respond directly to user prompts with clear, concise, and relevant content. Maintain a neutral, helpful tone.

Rules:
- <Document> is the entire note the user is working on.
- <Reminder> is a reminder of how you should reply to INSTRUCTIONS. It does not apply to questions.
- Anything else is the user prompt.
- Your response should be tailored to the user's prompt, providing precise assistance to optimize note management.
- For INSTRUCTIONS: Follow the <Reminder> exactly. Provide ONLY the content to be inserted or replaced. No explanations or comments.
- For QUESTIONS: Provide a helpful and concise answer. You may include brief explanations if necessary.
- CRITICAL: DO NOT remove or modify the following custom MDX tags: <u>, <callout>, <kbd>, <toc>, <sub>, <sup>, <mark>, <del>, <date>, <span>, <column>, <column_group>, <file>, <audio>, <video> in <Selection> unless the user explicitly requests this change.
- CRITICAL: Distinguish between INSTRUCTIONS and QUESTIONS. Instructions typically ask you to modify or add content. Questions ask for information or clarification.
- CRITICAL: when asked to write in markdown, do not start with \`\`\`markdown.
- CRITICAL: When writing the column, such line breaks and indentation must be preserved.
<column_group>
<column>
  1
</column>
<column>
  2
</column>
<column>
  3
</column>
</column_group>
`

const generateSystemDefault = `\
${systemCommon}
- <Block> is the current block of text the user is working on.

<Block>
{block}
</Block>
`

const generateSystemSelecting = `\
${systemCommon}
- <Block> contains the text context. You will always receive one <Block>.
- <selection> is the text highlighted by the user.
`

const editSystemSelecting = `\
- <Block> shows the full sentence or paragraph, only for context. 
- <Selection> is the exact span of text inside <Block> that must be replaced. 
- Your output MUST be only the replacement string for <Selection>, with no tags. 
- Never output <Block> or <Selection> tags, and never output surrounding text. 
- The replacement must be grammatically correct when substituted back into <Block>. 
- Ensure the replacement fits seamlessly so the whole <Block> reads naturally. 
- Output must be limited to the replacement string itself.
- Do not remove the \\n in the original text
`

const promptDefault = `<Reminder>
CRITICAL: NEVER write <Block>.
</Reminder>
{prompt}`

const promptSelecting = `<Reminder>
If this is a question, provide a helpful and concise answer about <Selection>.
If this is an instruction, provide ONLY the text to replace <Selection>. No explanations.
Ensure it fits seamlessly within <Block>. If <Block> is empty, write ONE random sentence.
NEVER write <Block> or <Selection>.
</Reminder>
{prompt} about <Selection>

<Block>
{block}
</Block>
`

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

	const template = isSelecting ? promptSelecting : promptDefault

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

export const useChat = (config: ChatConfig | null) => {
	const editor = useEditorRef()
	const options = usePluginOption(aiChatPlugin, "chatOptions")
	const llmRef = useRef<any>(null)

	useEffect(() => {
		if (!config) return
		switch (config.provider) {
			case "anthropic":
				llmRef.current = createAnthropic({
					apiKey: config.apiKey,
				})(config.model)
				break
			case "google":
				llmRef.current = createGoogleGenerativeAI({
					apiKey: config.apiKey,
				})(config.model)
				break
			case "openai":
				llmRef.current = createOpenAI({
					apiKey: config.apiKey,
				})(config.model)
				break
			case "ollama":
				llmRef.current = ollama(config.model)
				break
			default:
				throw new Error(`Unsupported provider: ${config.provider}`)
		}
	}, [config])

	const chat = useBaseChat<ChatMessage>({
		id: "editor",
		transport: new DefaultChatTransport({
			fetch: async (_, init) => {
				if (!llmRef.current) throw new Error("LLM not found")

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

						const toolName: ToolName =
							toolNameParam ?? (isSelecting ? "edit" : "generate")

						writer.write({
							data: toolName,
							type: "data-toolName",
						})

						if (toolName === "generate") {
							const generateSystem = replacePlaceholders(
								tempEditor,
								isSelecting ? generateSystemSelecting : generateSystemDefault,
							)

							const gen = streamText({
								maxOutputTokens: 2048,
								messages: await convertToModelMessages(messages),
								model: llmRef.current,
								system: generateSystem,
								experimental_transform: markdownJoinerTransform(),
								abortSignal,
							})

							writer.merge(gen.toUIMessageStream({ sendFinish: false }))
						}

						if (toolName === "edit") {
							if (!isSelecting)
								throw new Error("Edit tool is only available when selecting")

							const editSystem = replacePlaceholders(
								tempEditor,
								editSystemSelecting,
							)

							const edit = streamText({
								maxOutputTokens: 2048,
								messages: await convertToModelMessages(messages),
								model: llmRef.current,
								system: editSystem,
								experimental_transform: markdownJoinerTransform(),
								abortSignal,
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
		...options,
	})

	// biome-ignore lint/correctness/useExhaustiveDependencies: true
	useEffect(() => {
		editor.setOption(AIChatPlugin, "chat", chat)
	}, [chat.status, chat.messages, chat.error])

	return chat
}
