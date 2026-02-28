export type EditorChatState =
	| "cursorCommand"
	| "cursorSuggestion"
	| "selectionCommand"

export type AIMenuCommand = {
	type: "selectionCommand"
	label: string
	prompt: string
}

export type AIMenuChatConfig = {
	provider: string
	model: string
}

export type AIMenuEnabledChatModel = {
	provider: string
	model: string
}

export type AIMenuRuntime = {
	chat: any
	chatConfig: AIMenuChatConfig | null
	enabledChatModels: AIMenuEnabledChatModel[]
	selectModel: (provider: string, model: string) => Promise<void> | void
	isLicenseValid: boolean
	canOpenModelSettings: boolean
	openModelSettings: () => void
}

export type AIMenuStorage = {
	loadCommands: () => AIMenuCommand[]
	saveCommands: (commands: AIMenuCommand[]) => void
	loadHiddenDefaultSelectionCommands: () => string[]
	saveHiddenDefaultSelectionCommands: (values: string[]) => void
}

export type AIMenuHostDeps = {
	useRuntime: () => AIMenuRuntime
	storage: AIMenuStorage
}
