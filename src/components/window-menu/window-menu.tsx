import { useEditorRef } from 'platejs/react'
import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { useFontScaleStore } from '@/store/font-scale-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { installWindowMenu } from './menu'

export function WindowMenu() {
  const editor = useEditorRef()

  const { createAndOpenNote, openFolderPicker } = useWorkspaceStore(
    useShallow((s) => ({
      createAndOpenNote: s.createAndOpenNote,
      openFolderPicker: s.openFolderPicker,
    }))
  )

  const toggleFileExplorer = useUIStore((s) => s.toggleFileExplorer)
  const { zoomIn, zoomOut, resetZoom } = useFontScaleStore(
    useShallow((s) => ({
      zoomIn: s.increaseFontScale,
      zoomOut: s.decreaseFontScale,
      resetZoom: s.resetFontScale,
    }))
  )

  useEffect(() => {
    installWindowMenu({
      editor,
      createNote: createAndOpenNote,
      openWorkspace: () => openFolderPicker(),
      toggleFileExplorer,
      zoomIn,
      zoomOut,
      resetZoom,
    })
  }, [
    editor,
    createAndOpenNote,
    openFolderPicker,
    toggleFileExplorer,
    zoomIn,
    zoomOut,
    resetZoom,
  ])

  return null
}
