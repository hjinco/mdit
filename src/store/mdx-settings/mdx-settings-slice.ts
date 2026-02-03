import type { StateCreator } from "zustand"

const MDX_ENABLED_KEY = "mdit-mdx-enabled"

export type MDXSettingsSlice = {
	isMDXEnabled: boolean
	setMDXEnabled: (enabled: boolean) => void
}

const getInitialMDXEnabled = (): boolean => {
	const stored = localStorage.getItem(MDX_ENABLED_KEY)
	if (stored === null) return false
	return stored === "true"
}

export const prepareMDXSettingsSlice =
	(): StateCreator<MDXSettingsSlice, [], [], MDXSettingsSlice> => (set) => ({
		isMDXEnabled: getInitialMDXEnabled(),
		setMDXEnabled: (enabled: boolean) => {
			localStorage.setItem(MDX_ENABLED_KEY, String(enabled))
			set({ isMDXEnabled: enabled })
		},
	})

export const createMDXSettingsSlice = prepareMDXSettingsSlice()
