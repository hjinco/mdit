import type { StateCreator } from "zustand"

export type ImageEditSlice = {
	imageEditPath: string | null
	setImageEditPath: (path: string | null) => void
	openImageEdit: (path: string) => void
	closeImageEdit: () => void
}

export const prepareImageEditSlice =
	(): StateCreator<ImageEditSlice, [], [], ImageEditSlice> => (set) => ({
		imageEditPath: null,
		setImageEditPath: (path) => set({ imageEditPath: path }),
		openImageEdit: (path) => set({ imageEditPath: path }),
		closeImageEdit: () => set({ imageEditPath: null }),
	})

export const createImageEditSlice = prepareImageEditSlice()
