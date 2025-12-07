import { create } from 'zustand'

// Focus mode hides chrome (e.g., editor header) once the user starts typing.
// Typing 4 keystrokes activates focus mode, and any mouse movement deactivates it.
const FOCUS_TYPING_THRESHOLD = 4

type EditorStore = {
  isScrolling: boolean
  scrollTimeoutId: NodeJS.Timeout | null
  handleScroll: () => void
  isFrontmatterInputting: boolean
  setIsFrontmatterInputting: (isInputting: boolean) => void
  // Focus mode state
  isFocusMode: boolean
  typingBurstCount: number
  handleTypingProgress: () => void
}

export const useEditorStore = create<EditorStore>((set, get) => {
  const handleMouseMove = () => {
    const { isFocusMode } = get()

    set({
      typingBurstCount: 0,
      ...(isFocusMode && { isFocusMode: false }),
    })
  }

  // Set up mouse move listener
  if (typeof window !== 'undefined') {
    window.addEventListener('mousemove', handleMouseMove)
  }

  return {
    isScrolling: false,
    scrollTimeoutId: null,
    handleScroll: () => {
      const { scrollTimeoutId } = get()

      if (scrollTimeoutId) {
        // Clear existing timeout if any
        clearTimeout(scrollTimeoutId)
      }

      // Set new timeout
      const timeoutId = setTimeout(() => {
        set({ isScrolling: false, scrollTimeoutId: null })
      }, 300)

      set({ isScrolling: true, scrollTimeoutId: timeoutId })
    },
    isFrontmatterInputting: false,
    setIsFrontmatterInputting: (isInputting: boolean) => {
      set({ isFrontmatterInputting: isInputting })
    },
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
  }
})
