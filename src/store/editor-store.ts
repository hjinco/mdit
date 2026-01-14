import { create } from 'zustand'

// Focus mode hides chrome (e.g., editor header) once the user starts typing.
// Typing 4 keystrokes activates focus mode, and any mouse movement deactivates it.
const FOCUS_TYPING_THRESHOLD = 4

type EditorStore = {
  // Focus mode state
  isFocusMode: boolean
  typingBurstCount: number
  handleTypingProgress: () => void
  resetFocusMode: () => void
  frontmatterFocusTarget: 'none' | 'firstCell' | 'addButton'
  setFrontmatterFocusTarget: (
    frontmatterFocusTarget: EditorStore['frontmatterFocusTarget']
  ) => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  // Focus mode state
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
  frontmatterFocusTarget: 'none',
  setFrontmatterFocusTarget: (
    frontmatterFocusTarget: EditorStore['frontmatterFocusTarget']
  ) => {
    set({
      frontmatterFocusTarget,
    })
  },
}))
