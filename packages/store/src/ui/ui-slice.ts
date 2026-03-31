import type { StateCreator } from "zustand"

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
	setFileExplorerOpen: (isOpen: boolean) => boolean
	getFontScale: () => number
	setFontScale: (value: number) => number
	increaseFontScale: (currentValue: number) => number
	decreaseFontScale: (currentValue: number) => number
	resetFontScale: () => number
	getLocalApiEnabled: () => boolean
	setLocalApiEnabled: (enabled: boolean) => boolean
}

export type UISlice = {
	isFileExplorerOpen: boolean
	setFileExplorerOpen: (isOpen: boolean) => void
	toggleFileExplorerOpen: () => void
	isGraphViewDialogOpen: boolean
	setGraphViewDialogOpen: (isOpen: boolean) => void
	openGraphViewDialog: () => void
	toggleGraphViewDialogOpen: () => void
	isSettingsDialogOpen: boolean
	setSettingsDialogOpen: (isOpen: boolean) => void
	toggleSettingsDialogOpen: () => void
	isNoteInfoOpen: boolean
	setNoteInfoOpen: (isOpen: boolean) => void
	toggleNoteInfoOpen: () => void
	settingsInitialTab: SettingsTab | null
	openSettingsWithTab: (tab: SettingsTab) => void
	isCommandMenuOpen: boolean
	commandMenuInitialQuery: string | null
	setCommandMenuOpen: (isOpen: boolean) => void
	openCommandMenu: () => void
	openCommandMenuWithQuery: (query: string) => void
	closeCommandMenu: () => void
	toggleCommandMenu: () => void
	isUpdateReady: boolean
	isUpdateDownloading: boolean
	setUpdateReady: (ready: boolean) => void
	setUpdateDownloading: (downloading: boolean) => void
	imagePreviewPath: string | null
	setImagePreviewPath: (path: string | null) => void
	openImagePreview: (path: string) => void
	closeImagePreview: () => void
	fontScale: number
	setFontScale: (updater: FontScaleUpdater) => void
	increaseFontScale: () => void
	decreaseFontScale: () => void
	resetFontScale: () => void
	localApiEnabled: boolean
	setLocalApiEnabled: (enabled: boolean) => void
	localApiError: string | null
	setLocalApiError: (message: string | null) => void
}

export type UISliceDependencies = {
	preferences: UIPreferences
}

export const prepareUISlice =
	({
		preferences,
	}: UISliceDependencies): StateCreator<UISlice, [], [], UISlice> =>
	(set) => ({
		isFileExplorerOpen: preferences.getFileExplorerOpen(),
		setFileExplorerOpen: (isOpen) => {
			set({
				isFileExplorerOpen: preferences.setFileExplorerOpen(isOpen),
			})
		},
		toggleFileExplorerOpen: () =>
			set((state) => {
				return {
					isFileExplorerOpen: preferences.setFileExplorerOpen(
						!state.isFileExplorerOpen,
					),
				}
			}),
		isGraphViewDialogOpen: false,
		setGraphViewDialogOpen: (isOpen) => set({ isGraphViewDialogOpen: isOpen }),
		openGraphViewDialog: () => set({ isGraphViewDialogOpen: true }),
		toggleGraphViewDialogOpen: () =>
			set((state) => ({
				isGraphViewDialogOpen: !state.isGraphViewDialogOpen,
			})),
		isSettingsDialogOpen: false,
		setSettingsDialogOpen: (isOpen) => set({ isSettingsDialogOpen: isOpen }),
		toggleSettingsDialogOpen: () =>
			set((state) => ({ isSettingsDialogOpen: !state.isSettingsDialogOpen })),
		isNoteInfoOpen: false,
		setNoteInfoOpen: (isOpen) => set({ isNoteInfoOpen: isOpen }),
		toggleNoteInfoOpen: () =>
			set((state) => ({ isNoteInfoOpen: !state.isNoteInfoOpen })),
		settingsInitialTab: null,
		openSettingsWithTab: (tab) =>
			set({
				isSettingsDialogOpen: true,
				settingsInitialTab: tab,
			}),
		isCommandMenuOpen: false,
		commandMenuInitialQuery: null,
		setCommandMenuOpen: (isOpen) =>
			set((state) => ({
				isCommandMenuOpen: isOpen,
				commandMenuInitialQuery: isOpen ? state.commandMenuInitialQuery : null,
			})),
		openCommandMenu: () =>
			set({
				isCommandMenuOpen: true,
				commandMenuInitialQuery: null,
			}),
		openCommandMenuWithQuery: (query) =>
			set({
				isCommandMenuOpen: true,
				commandMenuInitialQuery: query.trim() || null,
			}),
		closeCommandMenu: () =>
			set({
				isCommandMenuOpen: false,
				commandMenuInitialQuery: null,
			}),
		toggleCommandMenu: () =>
			set((state) => ({
				isCommandMenuOpen: !state.isCommandMenuOpen,
				commandMenuInitialQuery: state.isCommandMenuOpen
					? null
					: state.commandMenuInitialQuery,
			})),
		isUpdateReady: false,
		isUpdateDownloading: false,
		setUpdateReady: (ready) => set({ isUpdateReady: ready }),
		setUpdateDownloading: (downloading) =>
			set({ isUpdateDownloading: downloading }),
		imagePreviewPath: null,
		setImagePreviewPath: (path) => set({ imagePreviewPath: path }),
		openImagePreview: (path) => set({ imagePreviewPath: path }),
		closeImagePreview: () => set({ imagePreviewPath: null }),
		fontScale: preferences.getFontScale(),
		setFontScale: (updater) =>
			set((state) => {
				const nextValue =
					typeof updater === "function"
						? (updater as (value: number) => number)(state.fontScale)
						: updater
				const clampedValue = preferences.setFontScale(nextValue)
				return { fontScale: clampedValue }
			}),
		increaseFontScale: () =>
			set((state) => {
				const newValue = preferences.increaseFontScale(state.fontScale)
				return { fontScale: newValue }
			}),
		decreaseFontScale: () =>
			set((state) => {
				const newValue = preferences.decreaseFontScale(state.fontScale)
				return { fontScale: newValue }
			}),
		resetFontScale: () => {
			const resetValue = preferences.resetFontScale()
			set({ fontScale: resetValue })
		},
		localApiEnabled: preferences.getLocalApiEnabled(),
		setLocalApiEnabled: (enabled) => {
			const nextValue = preferences.setLocalApiEnabled(enabled)
			set({ localApiEnabled: nextValue })
		},
		localApiError: null,
		setLocalApiError: (message) => set({ localApiError: message }),
	})
