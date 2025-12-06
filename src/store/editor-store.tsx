import { create } from 'zustand'

type EditorStore = {
  isScrolling: boolean
  scrollTimeoutId: NodeJS.Timeout | null
  handleScroll: () => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  isScrolling: false,
  scrollTimeoutId: null,
  handleScroll: () => {
    const state = get()

    // Clear existing timeout if any
    if (state.scrollTimeoutId) {
      clearTimeout(state.scrollTimeoutId)
    }

    // Set scrolling to true
    set({ isScrolling: true })

    // Set new timeout
    const timeoutId = setTimeout(() => {
      set({ isScrolling: false, scrollTimeoutId: null })
    }, 300)

    set({ scrollTimeoutId: timeoutId })
  },
}))
