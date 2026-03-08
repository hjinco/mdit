import { createPlatePlugin } from "platejs/react"
import { insertResolvedImage } from "./image-insert"
import {
	type EditorImageLinkErrorHandler,
	type EditorImageLinkResolver,
	resolveEditorImageLink,
} from "./image-link-resolver"

export const FILE_PASTE_KEY = "FilePaste"

export type FilePasteHostDeps = {
	readClipboardFiles: () => Promise<string[] | null | undefined>
	isImageFile: (path: string) => boolean
	resolveImageLink?: EditorImageLinkResolver
	onResolveImageLinkError?: EditorImageLinkErrorHandler
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
						const imageData = await resolveEditorImageLink(absPath, host)
						if (!imageData) {
							continue
						}
						insertResolvedImage(editor, imageData, { nextBlock: true })
					}
				})()
			},
		},
	}),
]
