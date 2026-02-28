import { AIChatPlugin, useEditorChat } from "@platejs/ai/react"
import { BlockSelectionPlugin, useIsSelecting } from "@platejs/selection/react"
import { isHotkey, KEYS, type NodeEntry } from "platejs"
import {
	useEditorPlugin,
	useFocusedLast,
	useHotkeys,
	usePluginOption,
} from "platejs/react"
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react"
import type {
	AIMenuCommand,
	AIMenuHostDeps,
	AIMenuRuntime,
	EditorChatState,
} from "./ai-menu.types"
import { useAICommands } from "./use-ai-commands"

export type AIMenuController = {
	open: boolean
	anchorElement: HTMLElement | null
	modelPopoverOpen: boolean
	addCommandOpen: boolean
	chatConfig: AIMenuRuntime["chatConfig"]
	enabledChatModels: AIMenuRuntime["enabledChatModels"]
	isLoading: boolean
	messages: any[]
	commands: AIMenuCommand[]
	input: string
	value: string
	menuState: EditorChatState
	isLicenseValid: boolean
	canOpenModelSettings: boolean
	shouldRender: boolean
	onModelPopoverOpenChange: (open: boolean) => void
	onSelectModel: (provider: string, model: string) => void
	onOpenModelSettings: () => void
	onValueChange: (value: string) => void
	onInputChange: (value: string) => void
	onInputClick: () => void
	onInputKeyDown: (e: KeyboardEvent) => void
	onSubmit: () => void
	onAddCommandOpen: () => void
	onAddCommand: (command: AIMenuCommand) => void
	onAddCommandClose: () => void
	onCommandRemove: (type: "selectionCommand", label: string) => void
	onPopoverOpenChange: (open: boolean) => void
}

type SubmitMode = "chat" | "insert"
type SubmitToolName = "edit" | "generate"

const getSubmitTarget = (
	menuState: EditorChatState,
): { mode: SubmitMode; toolName: SubmitToolName } => {
	if (menuState === "cursorCommand") {
		return { mode: "insert", toolName: "generate" }
	}

	return { mode: "chat", toolName: "edit" }
}

const useAIMenuSubmit = ({
	api,
	chatConfig,
	input,
	isLicenseValid,
	menuState,
	setInput,
	setModelPopoverOpen,
	value,
}: {
	api: any
	chatConfig: AIMenuRuntime["chatConfig"]
	input: string
	isLicenseValid: boolean
	menuState: EditorChatState
	setInput: (value: string) => void
	setModelPopoverOpen: (open: boolean) => void
	value: string
}) => {
	const submitTarget = useMemo(() => getSubmitTarget(menuState), [menuState])

	return useCallback(() => {
		if (!chatConfig) {
			setModelPopoverOpen(true)
			return
		}
		if (!isLicenseValid || value) {
			return
		}

		api.aiChat.submit(input, submitTarget)
		setInput("")
	}, [
		api.aiChat,
		chatConfig,
		input,
		isLicenseValid,
		setInput,
		setModelPopoverOpen,
		submitTarget,
		value,
	])
}

const useAIMenuOpenController = ({
	addCommandOpen,
	api,
	setAddCommandOpen,
}: {
	addCommandOpen: boolean
	api: any
	setAddCommandOpen: (open: boolean) => void
}) => {
	const setOpen = useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				api.aiChat.show()
			} else {
				api.aiChat.hide()
			}
		},
		[api.aiChat],
	)

	const onPopoverOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen && addCommandOpen) {
				setAddCommandOpen(false)
				return
			}
			setOpen(nextOpen)
		},
		[addCommandOpen, setAddCommandOpen, setOpen],
	)

	return {
		setOpen,
		onPopoverOpenChange,
	}
}

const useAIMenuAnchor = ({
	api,
	chat,
	clearInput,
	editor,
	isLoading,
	mode,
	setOpen,
	streaming,
	toolName,
}: {
	api: any
	chat: AIMenuRuntime["chat"]
	clearInput: () => void
	editor: any
	isLoading: boolean
	mode: string | null
	setOpen: (open: boolean) => void
	streaming: boolean
	toolName: string | null
}) => {
	const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)

	const show = useCallback(
		(nextAnchorElement: HTMLElement) => {
			setAnchorElement(nextAnchorElement)
			setOpen(true)
		},
		[setOpen],
	)

	useEditorChat({
		chat,
		onOpenBlockSelection: (blocks: NodeEntry[]) => {
			const lastBlock = blocks.at(-1)
			if (!lastBlock) return
			const domNode = editor.api.toDOMNode(lastBlock[0])
			if (!domNode) return
			show(domNode)
		},
		onOpenChange: (nextOpen) => {
			if (!nextOpen) {
				setTimeout(() => {
					setAnchorElement(null)
					clearInput()
				}, 100)
			}
		},
		onOpenCursor: () => {
			const highestBlock = editor.api.block({ highest: true })
			if (!highestBlock) return
			const ancestor = highestBlock[0]

			if (!editor.api.isEmpty(ancestor)) {
				editor
					.getApi(BlockSelectionPlugin)
					.blockSelection.set(ancestor.id as string)
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: keep behavior aligned with prior implementation
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: keep behavior aligned with prior implementation
	useEffect(() => {
		if (toolName === "edit" && mode === "chat" && !isLoading) {
			let anchorNode = editor.api.node({
				at: [],
				reverse: true,
				match: (n: any) => !!n[KEYS.suggestion],
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

	return {
		anchorElement,
	}
}

export function useAIMenuController(host: AIMenuHostDeps): AIMenuController {
	const { api, editor } = useEditorPlugin(AIChatPlugin)
	const mode = usePluginOption(AIChatPlugin, "mode")
	const toolName = usePluginOption(AIChatPlugin, "toolName")
	const streaming = usePluginOption(AIChatPlugin, "streaming")
	const isFocusedLast = useFocusedLast()
	const open = usePluginOption(AIChatPlugin, "open") && isFocusedLast
	const [value, setValue] = useState("")
	const [input, setInput] = useState("")
	const [modelPopoverOpen, setModelPopoverOpen] = useState(false)
	const [addCommandOpen, setAddCommandOpen] = useState(false)

	const {
		chat,
		chatConfig,
		enabledChatModels,
		selectModel,
		isLicenseValid,
		canOpenModelSettings,
		openModelSettings,
	} = host.useRuntime()
	const status = chat?.status ?? "ready"
	const messages = Array.isArray(chat?.messages) ? chat.messages : []
	const { commands, addCommand, removeCommand } = useAICommands(host.storage)
	const isSelecting = useIsSelecting()
	const isLoading = status === "streaming" || status === "submitted"

	const { setOpen, onPopoverOpenChange } = useAIMenuOpenController({
		addCommandOpen,
		api,
		setAddCommandOpen,
	})

	const clearInput = useCallback(() => {
		setInput("")
	}, [])

	const { anchorElement } = useAIMenuAnchor({
		api,
		chat,
		clearInput,
		editor,
		isLoading,
		mode,
		setOpen,
		streaming,
		toolName,
	})

	const hasAssistantSuggestion = useMemo(() => {
		if (status === "error") return false

		return messages.some((message: any) => {
			if (message?.role !== "assistant") return false
			if (!Array.isArray(message.parts)) return false

			return message.parts.some(
				(part: any) => part?.type === "text" && part?.text?.trim().length > 0,
			)
		})
	}, [messages, status])

	const menuState = useMemo<EditorChatState>(() => {
		if (hasAssistantSuggestion) {
			return "cursorSuggestion"
		}

		return isSelecting ? "selectionCommand" : "cursorCommand"
	}, [hasAssistantSuggestion, isSelecting])

	const handleSubmit = useAIMenuSubmit({
		api,
		chatConfig,
		input,
		isLicenseValid,
		menuState,
		setInput,
		setModelPopoverOpen,
		value,
	})

	useHotkeys("esc", () => {
		api.aiChat.stop()
	})

	const onModelPopoverOpenChange = useCallback((nextOpen: boolean) => {
		setModelPopoverOpen(nextOpen)
	}, [])

	const onSelectModel = useCallback(
		(provider: string, model: string) => {
			void selectModel(provider, model)
		},
		[selectModel],
	)

	const onOpenModelSettings = useCallback(() => {
		openModelSettings()
	}, [openModelSettings])

	const onValueChange = useCallback((nextValue: string) => {
		setValue(nextValue)
	}, [])

	const onInputChange = useCallback((nextInput: string) => {
		setInput(nextInput)
	}, [])

	const onInputClick = useCallback(() => {
		if (!chatConfig) {
			setModelPopoverOpen(true)
		}
	}, [chatConfig])

	const onInputKeyDown = useCallback(
		(e: KeyboardEvent) => {
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
		},
		[chatConfig, handleSubmit, input.length, value],
	)

	const onAddCommandOpen = useCallback(() => {
		setAddCommandOpen(true)
	}, [])

	const onAddCommand = useCallback(
		(command: AIMenuCommand) => {
			addCommand(command)
			setAddCommandOpen(false)
		},
		[addCommand],
	)

	const onAddCommandClose = useCallback(() => {
		setAddCommandOpen(false)
	}, [])

	const onCommandRemove = useCallback(
		(type: "selectionCommand", label: string) => {
			removeCommand(type, label)
		},
		[removeCommand],
	)

	const shouldRender = !(
		(isLoading && mode === "insert") ||
		toolName === "comment" ||
		(toolName === "edit" && mode === "chat" && isLoading)
	)

	return {
		open,
		anchorElement,
		modelPopoverOpen,
		addCommandOpen,
		chatConfig,
		enabledChatModels,
		isLoading,
		messages,
		commands,
		input,
		value,
		menuState,
		isLicenseValid,
		canOpenModelSettings,
		shouldRender,
		onModelPopoverOpenChange,
		onSelectModel,
		onOpenModelSettings,
		onValueChange,
		onInputChange,
		onInputClick,
		onInputKeyDown,
		onSubmit: handleSubmit,
		onAddCommandOpen,
		onAddCommand,
		onAddCommandClose,
		onCommandRemove,
		onPopoverOpenChange,
	}
}
