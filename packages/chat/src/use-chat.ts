import { useChat as useBaseChat } from "@ai-sdk/react"
import {
	buildProviderRequestOptions,
	createModelFromChatConfig,
} from "@mdit/ai"
import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
	DefaultChatTransport,
	stepCountIs,
	streamText,
	type UIMessage,
} from "ai"
import { useCallback, useMemo, useRef } from "react"
import type { ChatMessage } from "./chat"
import {
	createPanelChatTools,
	PANEL_CHAT_TOOLS_SYSTEM_SUFFIX,
	type PanelChatToolDeps,
} from "./panel-chat-tools"

const DEFAULT_SYSTEM_PROMPT =
	"You are a helpful assistant for writing and organizing markdown notes."

export type ChatRuntimeConfig = Parameters<typeof createModelFromChatConfig>[0]

export type UseChatOptions = {
	resolveActiveConfig: () => Promise<ChatRuntimeConfig | null>
	codexBaseUrl: string
	fetch: typeof fetch
	enabled?: boolean
	id?: string
	systemPrompt?: string
	/** When set, enables read_active_document; keep deps stable (e.g. memoize in the host). */
	panelChatToolDeps?: PanelChatToolDeps
	onError?: (error: Error) => void
}

export type UseChatResult = {
	messages: ChatMessage[]
	pending: boolean
	error: string | null
	send: (text: string) => Promise<void>
	stop: () => void
	startNewChat: () => void
}

const extractMessageText = (message: UIMessage): string =>
	message.parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("")

export function useChat(options: UseChatOptions): UseChatResult {
	const {
		resolveActiveConfig,
		codexBaseUrl,
		fetch,
		enabled = true,
		id = "mdit-chat",
		systemPrompt = DEFAULT_SYSTEM_PROMPT,
		panelChatToolDeps,
		onError,
	} = options

	const sessionIdRef = useRef(crypto.randomUUID())

	const panelChatTools = useMemo(
		() =>
			panelChatToolDeps ? createPanelChatTools(panelChatToolDeps) : undefined,
		[panelChatToolDeps],
	)

	const effectiveSystemPrompt = useMemo(
		() =>
			panelChatToolDeps
				? `${systemPrompt}${PANEL_CHAT_TOOLS_SYSTEM_SUFFIX}`
				: systemPrompt,
		[panelChatToolDeps, systemPrompt],
	)

	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				fetch: async (_input, init) => {
					const activeConfig = await resolveActiveConfig()
					if (!activeConfig) {
						throw new Error("AI model is not configured.")
					}

					const model = createModelFromChatConfig(activeConfig, {
						codex: {
							baseURL: codexBaseUrl,
							createSessionId: () => sessionIdRef.current,
							fetch,
							sessionId: sessionIdRef.current,
						},
					})
					const body = JSON.parse(
						typeof init?.body === "string" ? init.body : "{}",
					) as {
						messages?: UIMessage[]
					}
					const messages = body.messages ?? []
					const abortSignal = init?.signal as AbortSignal | undefined

					const stream = createUIMessageStream({
						execute: async ({ writer }) => {
							const modelMessages = await convertToModelMessages(messages)
							const result = streamText({
								...buildProviderRequestOptions(
									activeConfig.provider,
									effectiveSystemPrompt,
								),
								abortSignal,
								messages: modelMessages,
								model,
								...(panelChatTools
									? { stopWhen: stepCountIs(5), tools: panelChatTools }
									: {}),
							})

							writer.merge(result.toUIMessageStream())
						},
					})

					return createUIMessageStreamResponse({ stream })
				},
			}),
		[
			codexBaseUrl,
			effectiveSystemPrompt,
			fetch,
			panelChatTools,
			resolveActiveConfig,
		],
	)

	const chat = useBaseChat({
		id,
		transport,
		onError(error) {
			onError?.(error)
		},
	})
	const isPending = chat.status === "submitted" || chat.status === "streaming"

	const messages = useMemo<ChatMessage[]>(
		() =>
			chat.messages.map((message) => ({
				content: extractMessageText(message),
				id: message.id,
				role: message.role === "user" ? "user" : "assistant",
			})),
		[chat.messages],
	)

	const send = useCallback(
		async (text: string) => {
			if (!enabled || isPending) {
				return
			}
			const normalized = text.trim()
			if (!normalized) {
				return
			}
			await chat.sendMessage({ text: normalized })
		},
		[chat, enabled, isPending],
	)

	const stop = useCallback(() => {
		chat.stop()
	}, [chat])

	const startNewChat = useCallback(() => {
		chat.stop()
		sessionIdRef.current = crypto.randomUUID()
		chat.setMessages([])
		chat.clearError()
	}, [chat])

	return {
		error: chat.error?.message ?? null,
		messages,
		pending: isPending,
		send,
		stop,
		startNewChat,
	}
}
