import { useDndMonitor, useDroppable } from '@dnd-kit/core'
import { insertImage } from '@platejs/media'
import mime from 'mime/lite'
import { createPlatePlugin, useEditorRef } from 'platejs/react'
import { useCallback, useRef, useState } from 'react'
import { useDropZone } from '@/contexts/drop-context'
import { cn } from '@/lib/utils'
import { useFileExplorerSelectionStore } from '@/store/file-explorer-selection-store'
import { isImageFile } from '@/utils/file-icon'

type ActiveDragData = { path?: string; isDirectory?: boolean } | undefined

const collectImagePaths = (activeData: ActiveDragData) => {
  const activePath = activeData?.path
  if (!activePath || activeData?.isDirectory) {
    return []
  }

  const selection = Array.from(
    useFileExplorerSelectionStore.getState().selectedEntryPaths
  )

  const candidatePaths = selection.includes(activePath)
    ? selection
    : [activePath]

  return candidatePaths.filter((path) => {
    const lastSlash = path.lastIndexOf('/')
    const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
    const lastDot = fileName.lastIndexOf('.')
    if (lastDot <= 0) {
      return false
    }
    const extension = fileName.slice(lastDot)
    return isImageFile(extension)
  })
}

function DropZone({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const editor = useEditorRef()
  const [isDraggingImage, setIsDraggingImage] = useState(false)

  const { setNodeRef, isOver: isOverDnd } = useDroppable({
    id: 'editor-dropzone',
    data: { kind: 'editor' },
  })

  useDropZone({
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

  useDndMonitor({
    onDragStart: (event) => {
      const activeData = event.active.data.current as ActiveDragData
      setIsDraggingImage(collectImagePaths(activeData).length > 0)
    },
    onDragCancel: () => {
      setIsDraggingImage(false)
    },
    onDragEnd: (event) => {
      const overKind = event.over?.data.current?.kind
      if (overKind !== 'editor') {
        setIsDraggingImage(false)
        return
      }

      const activeData = event.active.data.current as ActiveDragData
      const imagePaths = collectImagePaths(activeData)

      if (imagePaths.length === 0) {
        setIsDraggingImage(false)
        return
      }

      editor.tf.focus()
      for (const imagePath of imagePaths) {
        insertImage(editor, imagePath)
      }
      setIsDraggingImage(false)
    },
  })

  const assignRefs = useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node
      setNodeRef(node)
    },
    [setNodeRef]
  )

  const shouldHighlight = isOverDnd && isDraggingImage

  return (
    <div
      ref={assignRefs}
      className={cn(
        'size-full',
        shouldHighlight &&
          'bg-blue-100/30 dark:bg-blue-900/30 ring-2 ring-inset ring-blue-400 dark:ring-blue-600'
      )}
    >
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
