import { insertImage } from '@platejs/media'
import { createPlatePlugin } from 'platejs/react'
import clipboard from 'tauri-plugin-clipboard-api'
import { isImageFile } from '@/utils/file-icon'

export const FILE_PASTE_KEY = 'FilePaste'

export const filePastePlugin = createPlatePlugin({
  key: FILE_PASTE_KEY,
  handlers: {
    onPaste: ({ event, editor }) => {
      event.persist()

      ;(async () => {
        let files: string[] = []
        try {
          files = (await clipboard.readFiles()) || []
        } catch (_e) {}

        const imageFiles = files.filter((f) => isImageFile(f))

        if (!imageFiles.length) {
          return
        }

        event.preventDefault()

        for (const absPath of imageFiles) {
          if (isImageFile(absPath)) {
            insertImage(editor, absPath)
          }
        }
      })()
    },
  },
})

export const FilePasteKit = [filePastePlugin]
