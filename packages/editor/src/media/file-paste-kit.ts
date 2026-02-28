import { insertImage } from "@platejs/media"
import { createPlatePlugin } from "platejs/react"

export const FILE_PASTE_KEY = "FilePaste"

export type FilePasteHostDeps = {
	readClipboardFiles: () => Promise<string[] | null | undefined>
	isImageFile: (path: string) => boolean
}

type CreateFilePasteKitOptions = {
	host?: FilePasteHostDeps | null
}

export const createFilePasteKit = ({
	host,
}: CreateFilePasteKitOptions = {}) => [
	createPlatePlugin({
		key: FILE_PASTE_KEY,
		handlers: {
			onPaste: ({ event, editor }) => {
				if (!host) {
					return
				}

				event.persist()

				void (async () => {
					let files: string[] = []
					try {
						files = (await host.readClipboardFiles()) || []
					} catch {
						return
					}

					const imageFiles = files.filter((path) => host.isImageFile(path))
					if (imageFiles.length === 0) {
						return
					}

					event.preventDefault()
					for (const absPath of imageFiles) {
						insertImage(editor, absPath)
					}
				})()
			},
		},
	}),
]
