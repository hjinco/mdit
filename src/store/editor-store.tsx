import { create } from 'zustand'

type EditorStore = {
  isScrolling: boolean
  scrollTimeoutId: NodeJS.Timeout | null
  handleScroll: () => void
  isFrontmatterInputting: boolean
  setIsFrontmatterInputting: (isInputting: boolean) => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
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
}))
