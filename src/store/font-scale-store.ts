import { create } from 'zustand'

export const FONT_SCALE_STORAGE_KEY = 'font-scale'
export const DEFAULT_FONT_SCALE = 1
const MIN_FONT_SCALE = 0.8
const MAX_FONT_SCALE = 1.6
const FONT_SCALE_STEP = 0.1

export type FontScaleUpdater = number | ((current: number) => number)

const clampFontScale = (value: number) =>
  Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, Number(value.toFixed(2))))

const readInitialFontScale = () => {
  const storedValue = localStorage.getItem(FONT_SCALE_STORAGE_KEY)
  if (!storedValue) return DEFAULT_FONT_SCALE

  const parsed = Number.parseFloat(storedValue)
  if (!Number.isFinite(parsed)) {
    localStorage.removeItem(FONT_SCALE_STORAGE_KEY)
    return DEFAULT_FONT_SCALE
  }

  return clampFontScale(parsed)
}

type FontScaleState = {
  fontScale: number
  setFontScale: (updater: FontScaleUpdater) => void
  increaseFontScale: () => void
  decreaseFontScale: () => void
  resetFontScale: () => void
}

export const useFontScaleStore = create<FontScaleState>((set) => ({
  fontScale: readInitialFontScale(),
  setFontScale: (updater) =>
    set((state) => {
      const nextValue =
        typeof updater === 'function'
          ? (updater as (value: number) => number)(state.fontScale)
          : updater
      return { fontScale: clampFontScale(nextValue) }
    }),
  increaseFontScale: () =>
    set((state) => ({
      fontScale: clampFontScale(state.fontScale + FONT_SCALE_STEP),
    })),
  decreaseFontScale: () =>
    set((state) => ({
      fontScale: clampFontScale(state.fontScale - FONT_SCALE_STEP),
    })),
  resetFontScale: () => set({ fontScale: DEFAULT_FONT_SCALE }),
}))
