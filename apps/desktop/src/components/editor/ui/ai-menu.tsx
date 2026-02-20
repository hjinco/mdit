import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@mdit/ui/components/popover"
import { AIChatPlugin, useEditorChat } from "@platejs/ai/react"
import { BlockSelectionPlugin, useIsSelecting } from "@platejs/selection/react"
import { isHotkey, KEYS, type NodeEntry } from "platejs"
import {
	useEditorPlugin,
	useFocusedLast,
	useHotkeys,
	usePluginOption,
} from "platejs/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import { useAICommands } from "../hooks/use-ai-commands"
import { useChat } from "../hooks/use-chat"
import { AIMenuAddCommand } from "./ai-menu-add-command"
import { AIMenuContent } from "./ai-menu-content"

type EditorChatState = "cursorCommand" | "cursorSuggestion" | "selectionCommand"

export function AIMenu() {
	const { api, editor } = useEditorPlugin(AIChatPlugin)
	const mode = usePluginOption(AIChatPlugin, "mode")
	const toolName = usePluginOption(AIChatPlugin, "toolName")
	const streaming = usePluginOption(AIChatPlugin, "streaming")
	const isFocusedLast = useFocusedLast()
	const open = usePluginOption(AIChatPlugin, "open") && isFocusedLast
	const [value, setValue] = useState("")

	const { chatConfig, licenseStatus } = useStore(
		useShallow((s) => ({
			chatConfig: s.chatConfig,
			licenseStatus: s.status,
		})),
	)
	const chat = useChat()

	const { status, messages } = chat
	const [input, setInput] = useState("")
	const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
	const [modelPopoverOpen, setModelPopoverOpen] = useState(false)

	const [addCommandOpen, setAddCommandOpen] = useState(false)
	const { commands, addCommand, removeCommand } = useAICommands()

	const isSelecting = useIsSelecting()

	const hasAssistantSuggestion = useMemo(() => {
		if (!messages || status === "error") return false

		return messages.some((message) => {
			if (message.role !== "assistant") return false
			return message.parts.some(
				(part) => part.type === "text" && part.text?.trim().length > 0,
			)
		})
	}, [messages, status])

	const menuState = useMemo<EditorChatState>(() => {
		if (hasAssistantSuggestion) {
			return "cursorSuggestion"
		}

		return isSelecting ? "selectionCommand" : "cursorCommand"
	}, [hasAssistantSuggestion, isSelecting])

	const submitMode =
		menuState === "selectionCommand" || menuState === "cursorSuggestion"
			? "chat"
			: "insert"
	const submitToolName = menuState === "cursorCommand" ? "generate" : "edit"

	const handleSubmit = useCallback(() => {
		if (!chatConfig) {
			setModelPopoverOpen(true)
			return
		}
		if (licenseStatus !== "valid") {
			return
		}
		if (value) {
			return
		}
		api.aiChat.submit(input, { mode: submitMode, toolName: submitToolName })
		setInput("")
	}, [
		api.aiChat,
		chatConfig,
		input,
		licenseStatus,
		submitMode,
		submitToolName,
		value,
	])

	// biome-ignore lint/correctness/useExhaustiveDependencies: true
	useEffect(() => {
		if (streaming) {
			const anchor = api.aiChat.node({ anchor: true })
			if (!anchor) return
			setTimeout(() => {
				const anchorDom = editor.api.toDOMNode(anchor![0])!
				setAnchorElement(anchorDom)
			}, 0)
		}
	}, [streaming])

	const setOpen = (open: boolean) => {
		if (open) {
			api.aiChat.show()
		} else {
			api.aiChat.hide()
		}
	}

	const show = (anchorElement: HTMLElement) => {
		setAnchorElement(anchorElement)
		setOpen(true)
	}

	useEditorChat({
		chat,
		onOpenBlockSelection: (blocks: NodeEntry[]) => {
			const lastBlock = blocks.at(-1)
			if (!lastBlock) return
			const domNode = editor.api.toDOMNode(lastBlock[0])
			if (!domNode) return
			show(domNode)
		},
		onOpenChange: (open) => {
			if (!open) {
				setTimeout(() => {
					setAnchorElement(null)
					setInput("")
				}, 100)
			}
		},
		onOpenCursor: () => {
			const highestBlock = editor.api.block({ highest: true })
			if (!highestBlock) return
			const ancestor = highestBlock[0]

			if (!editor.api.isEmpty(ancestor)) {
				const [, path] = highestBlock
				const start = editor.api.start(path)
				const end = editor.api.end(path)
				if (start && end) {
					editor.tf.select({ anchor: start, focus: end })
					editor
						.getApi(BlockSelectionPlugin)
						.blockSelection.set(ancestor.id as string)
				}
			}

			const domNode = editor.api.toDOMNode(ancestor)
			if (!domNode) return
			show(domNode)
		},
		onOpenSelection: () => {
			const lastBlock = editor.api.blocks().at(-1)
			if (!lastBlock) return
			const domNode = editor.api.toDOMNode(lastBlock[0])
			if (!domNode) return
			show(domNode)
		},
	})

	useHotkeys("esc", () => {
		api.aiChat.stop()
	})

	const isLoading = status === "streaming" || status === "submitted"

	// biome-ignore lint/correctness/useExhaustiveDependencies: true
	useEffect(() => {
		if (toolName === "edit" && mode === "chat" && !isLoading) {
			let anchorNode = editor.api.node({
				at: [],
				reverse: true,
				match: (n) => !!n[KEYS.suggestion],
			})
			if (!anchorNode) {
				anchorNode = editor
					.getApi(BlockSelectionPlugin)
					.blockSelection.getNodes({ selectionFallback: true, sort: true })
					.at(-1)
			}
			if (!anchorNode) return
			const block = editor.api.block({ at: anchorNode[1] })
			setAnchorElement(editor.api.toDOMNode(block![0]!)!)
		}
	}, [isLoading])

	if (isLoading && mode === "insert") return null
	if (toolName === "comment") return null
	if (toolName === "edit" && mode === "chat" && isLoading) return null

	return (
		<Popover
			open={open}
			onOpenChange={(open) => {
				if (!open && addCommandOpen) {
					setAddCommandOpen(false)
					return
				}
				setOpen(open)
			}}
		>
			<PopoverAnchor virtualRef={{ current: anchorElement! }} />

			<PopoverContent
				// For the animation
				key={addCommandOpen ? "addCommand" : "content"}
				className="border-none bg-transparent backdrop-blur-none p-0 shadow-none"
				align="center"
				side="bottom"
				style={{
					width: anchorElement?.offsetWidth,
				}}
			>
				{addCommandOpen ? (
					<AIMenuAddCommand
						onAdd={(command) => {
							addCommand(command)
							setAddCommandOpen(false)
						}}
						onClose={() => setAddCommandOpen(false)}
					/>
				) : (
					<AIMenuContent
						chatConfig={chatConfig}
						modelPopoverOpen={modelPopoverOpen}
						isLoading={isLoading}
						messages={messages}
						commands={commands}
						input={input}
						value={value}
						menuState={menuState}
						isLicenseValid={licenseStatus === "valid"}
						onModelPopoverOpenChange={setModelPopoverOpen}
						onValueChange={setValue}
						onInputChange={setInput}
						onInputClick={() => {
							if (!chatConfig) {
								setModelPopoverOpen(true)
							}
						}}
						onSubmit={handleSubmit}
						onInputKeyDown={(e) => {
							if (isHotkey("backspace")(e) && input.length === 0) {
								e.preventDefault()
								return
							}
							if (!chatConfig) {
								setModelPopoverOpen(true)
								return
							}
							if (isHotkey("enter")(e) && !e.shiftKey && !value) {
								e.preventDefault()
								handleSubmit()
							}
						}}
						onAddCommandOpen={() => setAddCommandOpen(true)}
						onCommandRemove={(type, label) => {
							removeCommand(type, label)
						}}
					/>
				)}
			</PopoverContent>
		</Popover>
	)
}
