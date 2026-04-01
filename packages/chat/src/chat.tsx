import { Button } from "@mdit/ui/components/button"
import { cn } from "@mdit/ui/lib/utils"
import type { ReactNode } from "react"
import { useCallback } from "react"

import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
} from "./ui/conversation"
import { Message, MessageContent, MessageResponse } from "./ui/message"
import {
	PromptInput,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "./ui/prompt-input"
import { type UseChatOptions, useChat } from "./use-chat"

export type ChatMessage = {
	id: string
	role: "user" | "assistant"
	content: string
}

export type ChatToolsRenderProps = {
	pending: boolean
	error: string | null
}

export type ChatProps = UseChatOptions & {
	tools?: ReactNode | ((props: ChatToolsRenderProps) => ReactNode)
	className?: string
	onOpenSettings?: () => void
}

export function Chat({
	tools,
	className,
	onOpenSettings,
	...useChatOptions
}: ChatProps) {
	const { enabled = true } = useChatOptions
	const {
		messages,
		pending,
		error,
		send: onSend,
		startNewChat,
	} = useChat(useChatOptions)

	const textInputDisabled = !enabled
	const submitDisabled = pending || !enabled

	const handleSubmit = useCallback(
		async (message: PromptInputMessage) => {
			await onSend(message.text)
		},
		[onSend],
	)

	const toolsContent =
		tools === undefined
			? undefined
			: typeof tools === "function"
				? tools({ error, pending })
				: tools

	return (
		<section className={cn("flex h-full min-h-0 flex-col", className)}>
			<div className="flex shrink-0 p-2">
				<Button
					onClick={startNewChat}
					size="sm"
					type="button"
					variant="outline"
				>
					New chat
				</Button>
			</div>
			<Conversation className="min-h-0 flex-1">
				<ConversationContent className="h-full">
					{messages.length === 0 ? (
						onOpenSettings ? (
							<ConversationEmptyState>
								<div className="flex flex-col items-center gap-3">
									<div className="space-y-1">
										<h3 className="font-medium text-sm">No messages yet</h3>
										<p className="text-muted-foreground text-sm">
											Start a conversation to see messages here
										</p>
									</div>
									<Button
										onClick={onOpenSettings}
										size="sm"
										type="button"
										variant="outline"
									>
										AI settings
									</Button>
								</div>
							</ConversationEmptyState>
						) : (
							<ConversationEmptyState />
						)
					) : (
						messages.map((message) => (
							<Message key={message.id} from={message.role}>
								<MessageContent>
									{message.role === "user" ? (
										<p className="whitespace-pre-wrap text-sm">
											{message.content}
										</p>
									) : (
										<MessageResponse>{message.content}</MessageResponse>
									)}
								</MessageContent>
							</Message>
						))
					)}
				</ConversationContent>
			</Conversation>

			<div className="p-2">
				<PromptInput onSubmit={handleSubmit}>
					<PromptInputTextarea
						disabled={textInputDisabled}
						placeholder="Ask the assistant"
					/>
					<PromptInputFooter>
						{toolsContent ? (
							<PromptInputTools>{toolsContent}</PromptInputTools>
						) : (
							<div />
						)}
						<PromptInputSubmit
							disabled={submitDisabled}
							status={pending ? "submitted" : undefined}
						/>
					</PromptInputFooter>
				</PromptInput>
			</div>
		</section>
	)
}
