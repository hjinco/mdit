import { createState } from "./create-state"

export type SettingsTab =
	| "preferences"
	| "ai"
	| "api-mcp"
	| "sync"
	| "indexing"
	| "hotkeys"

export type FontScaleUpdater = number | ((current: number) => number)

export type UIPreferences = {
	getFileExplorerOpen: () => boolean
	setFileExplorerOpen: (open: boolean) => boolean
	getFontScale: () => number
	setFontScale: (value: number) => number
	increaseFontScale: (current: number) => number
	decreaseFontScale: (current: number) => number
	resetFontScale: () => number
	getLocalApiEnabled: () => boolean
	setLocalApiEnabled: (enabled: boolean) => boolean
	getChatPanelBetaEnabled: () => boolean
	setChatPanelBetaEnabled: (enabled: boolean) => boolean
}

const FOCUS_TYPING_THRESHOLD = 4

export function createWindowState(
	preferences: UIPreferences,
	mode: "workspace" | "detached",
) {
	const state = createState({
		isEditMode: mode === "detached",
		isFileExplorerOpen: preferences.getFileExplorerOpen(),
		isSettingsDialogOpen: false,
		settingsInitialTab: null as SettingsTab | null,
		isNoteInfoOpen: false,
		isCommandMenuOpen: false,
		commandMenuInitialQuery: null as string | null,
		isUpdateReady: false,
		isUpdateDownloading: false,
		imagePreviewPath: null as string | null,
		imageEditPath: null as string | null,
		fontScale: preferences.getFontScale(),
		localApiEnabled: preferences.getLocalApiEnabled(),
		localApiError: null as string | null,
		chatPanelBetaEnabled: preferences.getChatPanelBetaEnabled(),
		isChatPanelOpen: false,
		isFocusMode: false,
	})
	let typingCount = 0

	const setFileExplorerOpen = (open: boolean) => {
		state.update({ isFileExplorerOpen: preferences.setFileExplorerOpen(open) })
	}

	const setSettingsDialogOpen = (open: boolean) => {
		state.update((current) => ({
			isSettingsDialogOpen: open,
			settingsInitialTab: open ? current.settingsInitialTab : null,
		}))
	}

	const setCommandMenuOpen = (open: boolean) => {
		state.update((current) => ({
			isCommandMenuOpen: open,
			commandMenuInitialQuery: open ? current.commandMenuInitialQuery : null,
		}))
	}

	const setChatPanelOpen = (open: boolean) => {
		state.update({
			isChatPanelOpen: open && state.getSnapshot().chatPanelBetaEnabled,
		})
	}

	return {
		getSnapshot: state.getSnapshot,
		subscribe: state.subscribe,
		commands: {
			setFileExplorerOpen,
			toggleFileExplorerOpen: () =>
				setFileExplorerOpen(!state.getSnapshot().isFileExplorerOpen),
			setSettingsDialogOpen,
			toggleSettingsDialogOpen: () =>
				setSettingsDialogOpen(!state.getSnapshot().isSettingsDialogOpen),
			openSettingsWithTab: (tab: SettingsTab) => {
				state.update({ isSettingsDialogOpen: true, settingsInitialTab: tab })
			},
			setNoteInfoOpen: (open: boolean) =>
				state.update({ isNoteInfoOpen: open }),
			toggleNoteInfoOpen: () =>
				state.update(({ isNoteInfoOpen }) => ({
					isNoteInfoOpen: !isNoteInfoOpen,
				})),
			setCommandMenuOpen,
			openCommandMenu: () =>
				state.update({
					isCommandMenuOpen: true,
					commandMenuInitialQuery: null,
				}),
			openCommandMenuWithQuery: (query: string) =>
				state.update({
					isCommandMenuOpen: true,
					commandMenuInitialQuery: query.trim() || null,
				}),
			closeCommandMenu: () => setCommandMenuOpen(false),
			toggleCommandMenu: () =>
				setCommandMenuOpen(!state.getSnapshot().isCommandMenuOpen),
			setUpdateReady: (ready: boolean) =>
				state.update({ isUpdateReady: ready }),
			setUpdateDownloading: (downloading: boolean) =>
				state.update({ isUpdateDownloading: downloading }),
			openImagePreview: (path: string) =>
				state.update({ imagePreviewPath: path }),
			closeImagePreview: () => state.update({ imagePreviewPath: null }),
			openImageEdit: (path: string) => state.update({ imageEditPath: path }),
			closeImageEdit: () => state.update({ imageEditPath: null }),
			setFontScale: (updater: FontScaleUpdater) => {
				const value =
					typeof updater === "function"
						? updater(state.getSnapshot().fontScale)
						: updater
				state.update({ fontScale: preferences.setFontScale(value) })
			},
			increaseFontScale: () =>
				state.update({
					fontScale: preferences.increaseFontScale(
						state.getSnapshot().fontScale,
					),
				}),
			decreaseFontScale: () =>
				state.update({
					fontScale: preferences.decreaseFontScale(
						state.getSnapshot().fontScale,
					),
				}),
			resetFontScale: () =>
				state.update({ fontScale: preferences.resetFontScale() }),
			setLocalApiEnabled: (enabled: boolean) =>
				state.update({
					localApiEnabled: preferences.setLocalApiEnabled(enabled),
				}),
			setLocalApiError: (message: string | null) =>
				state.update({ localApiError: message }),
			setChatPanelBetaEnabled: (enabled: boolean) => {
				const nextEnabled = preferences.setChatPanelBetaEnabled(enabled)
				state.update(({ isChatPanelOpen }) => ({
					chatPanelBetaEnabled: nextEnabled,
					isChatPanelOpen: nextEnabled && isChatPanelOpen,
				}))
			},
			setChatPanelOpen,
			toggleChatPanelOpen: () =>
				setChatPanelOpen(!state.getSnapshot().isChatPanelOpen),
			handleTypingProgress: () => {
				if (state.getSnapshot().isFocusMode) return
				typingCount++
				if (typingCount === FOCUS_TYPING_THRESHOLD) {
					state.update({ isFocusMode: true })
				}
			},
			resetFocusMode: () => {
				if (!state.getSnapshot().isFocusMode) return
				typingCount = 0
				state.update({ isFocusMode: false })
			},
		},
	}
}
