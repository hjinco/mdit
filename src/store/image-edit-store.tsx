import { create } from 'zustand'

type ImageEditStore = {
  imageEditPath: string | null
  setImageEditPath: (path: string | null) => void
  openImageEdit: (path: string) => void
  closeImageEdit: () => void
}

export const useImageEditStore = create<ImageEditStore>((set) => ({
  imageEditPath: null,
  setImageEditPath: (path) => set({ imageEditPath: path }),
  openImageEdit: (path) => set({ imageEditPath: path }),
  closeImageEdit: () => set({ imageEditPath: null }),
}))
