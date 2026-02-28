import { CODEX_BASE_URL } from "@mdit/ai"
import type {
	AIMenuCommand,
	AIMenuHostDeps,
	AIMenuStorage,
} from "@mdit/editor/ai"
import { useEditorChat } from "@mdit/editor/ai"
import { fetch as tauriHttpFetch } from "@tauri-apps/plugin-http"
import { createSlateEditor } from "platejs"
import { toast } from "sonner"
import { useShallow } from "zustand/shallow"
import { useCurrentWindowLabel } from "@/hooks/use-current-window-label"
import { useStore } from "@/store"
import { EditorKit } from "../plugins/editor-kit"

const AI_COMMANDS_KEY = "ai-commands"
const HIDDEN_DEFAULT_COMMANDS_KEY = "ai-hidden-default-selection-commands"

const isAIMenuCommand = (value: unknown): value is AIMenuCommand => {
	if (typeof value !== "object" || value === null) {
		return false
	}

	const candidate = value as {
		type?: unknown
		label?: unknown
		prompt?: unknown
	}

	return (
		candidate.type === "selectionCommand" &&
		typeof candidate.label === "string" &&
		typeof candidate.prompt === "string"
	)
}

const parseStoredJSON = (value: string | null): unknown => {
	if (!value) {
		return null
	}

	try {
		return JSON.parse(value)
	} catch {
		return null
	}
}

const loadCommandsFromStorage = (): AIMenuCommand[] => {
	const parsed = parseStoredJSON(localStorage.getItem(AI_COMMANDS_KEY))
	if (!Array.isArray(parsed)) {
		return []
	}

	return parsed.filter(isAIMenuCommand)
}

const loadHiddenDefaultSelectionCommandsFromStorage = (): string[] => {
	const parsed = parseStoredJSON(
		localStorage.getItem(HIDDEN_DEFAULT_COMMANDS_KEY),
	)
	if (!Array.isArray(parsed)) {
		return []
	}

	return parsed.filter((item): item is string => typeof item === "string")
}

const desktopAIMenuStorage: AIMenuStorage = {
	loadCommands: loadCommandsFromStorage,
	saveCommands: (commands) => {
		localStorage.setItem(AI_COMMANDS_KEY, JSON.stringify(commands))
	},
	loadHiddenDefaultSelectionCommands:
		loadHiddenDefaultSelectionCommandsFromStorage,
	saveHiddenDefaultSelectionCommands: (values) => {
		localStorage.setItem(HIDDEN_DEFAULT_COMMANDS_KEY, JSON.stringify(values))
	},
}

const resolveActiveChatConfig = async () => {
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

const useDesktopAIMenuRuntime: AIMenuHostDeps["useRuntime"] = () => {
	const {
		chatConfig,
		enabledChatModels,
		selectModel,
		openSettingsWithTab,
		licenseStatus,
	} = useStore(
		useShallow((s) => ({
			chatConfig: s.chatConfig,
			enabledChatModels: s.enabledChatModels,
			selectModel: s.selectModel,
			openSettingsWithTab: s.openSettingsWithTab,
			licenseStatus: s.status,
		})),
	)
	const windowLabel = useCurrentWindowLabel()
	const chat = useEditorChat({
		resolveActiveConfig: resolveActiveChatConfig,
		codexBaseUrl: CODEX_BASE_URL,
		fetch: tauriHttpFetch,
		createSessionId: () => crypto.randomUUID(),
		onError: (error) => {
			toast.error(error.message)
		},
		createTempEditor: ({ children, selection }) =>
			createSlateEditor({
				plugins: EditorKit,
				selection,
				value: children,
			}),
	})

	return {
		chat,
		chatConfig,
		enabledChatModels,
		selectModel: (provider, model) => {
			void selectModel(provider as Parameters<typeof selectModel>[0], model)
		},
		isLicenseValid: licenseStatus === "valid",
		canOpenModelSettings: windowLabel === "main",
		openModelSettings: () => openSettingsWithTab("ai"),
	}
}

export const createDesktopAIMenuHost = (): AIMenuHostDeps => ({
	useRuntime: useDesktopAIMenuRuntime,
	storage: desktopAIMenuStorage,
})

export const desktopAIMenuHost = createDesktopAIMenuHost()
