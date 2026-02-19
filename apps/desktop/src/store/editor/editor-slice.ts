import type { StateCreator } from "zustand"

const FOCUS_TYPING_THRESHOLD = 4

export type EditorSlice = {
	isFocusMode: boolean
	typingBurstCount: number
	handleTypingProgress: () => void
	resetFocusMode: () => void
	frontmatterFocusTarget: "none" | "firstCell" | "addButton"
	setFrontmatterFocusTarget: (
		frontmatterFocusTarget: EditorSlice["frontmatterFocusTarget"],
	) => void
}

export const prepareEditorSlice =
	(): StateCreator<EditorSlice, [], [], EditorSlice> => (set, get) => ({
		isFocusMode: false,
		typingBurstCount: 0,
		handleTypingProgress: () => {
			const { typingBurstCount, isFocusMode } = get()
			const newTypingBurstCount = typingBurstCount + 1

			if (!isFocusMode && newTypingBurstCount >= FOCUS_TYPING_THRESHOLD) {
				set({
					isFocusMode: true,
					typingBurstCount: 0,
				})
			} else {
				set({
					typingBurstCount: newTypingBurstCount,
				})
			}
		},
		resetFocusMode: () => {
			if (!get().isFocusMode) return
			set({
				typingBurstCount: 0,
				isFocusMode: false,
			})
		},
		frontmatterFocusTarget: "none",
		setFrontmatterFocusTarget: (frontmatterFocusTarget) => {
			set({
				frontmatterFocusTarget,
			})
		},
	})

export const createEditorSlice = prepareEditorSlice()
