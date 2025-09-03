import { insertImage } from '@platejs/media'
import mime from 'mime/lite'
import { createPlatePlugin, useEditorRef } from 'platejs/react'
import { useRef } from 'react'
import { useDropZone } from '@/contexts/drop-context'
import { cn } from '@/lib/utils'

function DropZone({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const editor = useEditorRef()

  const { isOver } = useDropZone({
    ref,
    onDrop: (paths) => {
      for (const path of paths) {
        const type = mime.getType(path)
        if (!type) continue
        if (type.startsWith('image/')) {
          insertImage(editor, path)
        } else if (type.startsWith('video/')) {
        } else if (type.startsWith('audio/')) {
        }
      }
    },
  })

  return (
    <div ref={ref} className={cn('size-full', isOver && 'bg-brand/15')}>
      {children}
    </div>
  )
}

const DropPlugin = createPlatePlugin({
  key: 'drop',
  render: {
    aboveSlate: DropZone,
  },
})

export const DropKit = [DropPlugin]
