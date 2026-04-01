import { type ChatProviderId, CODEX_BASE_URL } from "@mdit/ai"
import { Chat } from "@mdit/chat"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@mdit/ui/components/select"
import { readTextFile } from "@tauri-apps/plugin-fs"
import { fetch as tauriHttpFetch } from "@tauri-apps/plugin-http"
import { motion } from "motion/react"
import { useCallback, useMemo } from "react"
import { useShallow } from "zustand/shallow"
import { useResizablePanel } from "@/hooks/use-resizable-panel"
import { useStore } from "@/store"

const toModelSelectValue = (provider: ChatProviderId, model: string): string =>
	`${provider}|${model}`

export function ChatPanel() {
	const { chatPanelBetaEnabled, isChatPanelOpen, setChatPanelOpen } = useStore(
		useShallow((state) => ({
			chatPanelBetaEnabled: state.chatPanelBetaEnabled,
			isChatPanelOpen: state.isChatPanelOpen,
			setChatPanelOpen: state.setChatPanelOpen,
		})),
	)

	const { isOpen, width, isResizing, handlePointerDown } = useResizablePanel({
		storageKey: "chat-panel-width",
		defaultWidth: 340,
		minWidth: 260,
		maxWidth: 640,
		invertDrag: true,
		isOpen: isChatPanelOpen,
		setIsOpen: setChatPanelOpen,
	})

	if (!chatPanelBetaEnabled) {
		return null
	}

	return (
		<motion.aside
			className="relative shrink-0 overflow-hidden"
			animate={{ width: isOpen ? width : 0 }}
			initial={false}
			transition={
				isResizing
					? { width: { duration: 0 } }
					: { width: { type: "spring", bounce: 0, duration: 0.12 } }
			}
		>
			<div
				className="flex h-full shrink-0 flex-col border-l bg-background"
				style={{ width }}
			>
				<ChatPanelContent />
			</div>
			{isOpen && (
				<div
					className="absolute top-0 -left-1 z-10 h-full w-1.5 cursor-col-resize bg-transparent transition-colors delay-100 hover:bg-foreground/20"
					onPointerDown={handlePointerDown}
				/>
			)}
		</motion.aside>
	)
}

function ChatPanelContent() {
	const { chatConfig, enabledChatModels, selectModel, openSettingsWithTab } =
		useStore(
			useShallow((state) => ({
				chatConfig: state.chatConfig,
				enabledChatModels: state.enabledChatModels,
				selectModel: state.selectModel,
				openSettingsWithTab: state.openSettingsWithTab,
			})),
		)

	const isConfigured = Boolean(chatConfig)

	const resolveActiveConfig = useCallback(async () => {
		const currentConfig = useStore.getState().chatConfig
		if (!currentConfig) {
			return null
		}
		if (currentConfig.provider !== "codex_oauth") {
			return currentConfig
		}

		await useStore.getState().refreshCodexOAuthForTarget()
		return useStore.getState().chatConfig
	}, [])

	const selectedModelValue = useMemo(() => {
		if (!chatConfig) {
			return undefined
		}
		const exists = enabledChatModels.some(
			(item) =>
				item.provider === chatConfig.provider &&
				item.model === chatConfig.model,
		)
		if (!exists) {
			return undefined
		}
		return toModelSelectValue(chatConfig.provider, chatConfig.model)
	}, [chatConfig, enabledChatModels])

	const panelChatToolDeps = useMemo(
		() => ({
			getActiveDocumentPath: () => useStore.getState().getActiveTabPath(),
			readTextFile,
		}),
		[],
	)

	const handleModelChange = useCallback(
		async (value: string | null) => {
			if (!value) {
				return
			}

			const separatorIndex = value.indexOf("|")
			if (separatorIndex <= 0) {
				return
			}

			const provider = value.slice(0, separatorIndex) as ChatProviderId
			const model = value.slice(separatorIndex + 1)
			if (!model) {
				return
			}

			const isEnabledModel = enabledChatModels.some(
				(item) => item.provider === provider && item.model === model,
			)
			if (!isEnabledModel) {
				return
			}

			await selectModel(provider, model)
		},
		[enabledChatModels, selectModel],
	)

	return (
		<Chat
			id="desktop-chat"
			codexBaseUrl={CODEX_BASE_URL}
			enabled={isConfigured}
			fetch={tauriHttpFetch}
			onOpenSettings={() => openSettingsWithTab("ai")}
			panelChatToolDeps={panelChatToolDeps}
			resolveActiveConfig={resolveActiveConfig}
			tools={({ pending }) => (
				<Select
					disabled={pending || enabledChatModels.length === 0}
					onValueChange={(value) => {
						void handleModelChange(value)
					}}
					value={selectedModelValue}
				>
					<SelectTrigger className="h-7 w-[146px] rounded-sm text-xs">
						<SelectValue placeholder="Model" />
					</SelectTrigger>
					<SelectContent align="start">
						{enabledChatModels.map((item) => {
							const value = toModelSelectValue(item.provider, item.model)
							return (
								<SelectItem key={value} value={value}>
									{item.model}
								</SelectItem>
							)
						})}
					</SelectContent>
				</Select>
			)}
		/>
	)
}
