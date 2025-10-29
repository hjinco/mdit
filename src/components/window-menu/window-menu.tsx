import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { useFontScaleStore } from '@/store/font-scale-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { installWindowMenu } from './menu'

export function WindowMenu() {
  const { createAndOpenNote, openFolderPicker } = useWorkspaceStore(
    useShallow((s) => ({
      createAndOpenNote: s.createAndOpenNote,
      openFolderPicker: s.openFolderPicker,
    }))
  )

  const { toggleFileExplorer, openCommandPalette } = useUIStore(
    useShallow((s) => ({
      toggleFileExplorer: s.toggleFileExplorer,
      openCommandPalette: s.openCommandPalette,
    }))
  )
  const { zoomIn, zoomOut, resetZoom } = useFontScaleStore(
    useShallow((s) => ({
      zoomIn: s.increaseFontScale,
      zoomOut: s.decreaseFontScale,
      resetZoom: s.resetFontScale,
    }))
  )

  useEffect(() => {
    installWindowMenu({
      createNote: createAndOpenNote,
      openWorkspace: () => openFolderPicker(),
      toggleFileExplorer,
      zoomIn,
      zoomOut,
      resetZoom,
      openCommandPalette,
    })
  }, [
    createAndOpenNote,
    openFolderPicker,
    toggleFileExplorer,
    zoomIn,
    zoomOut,
    resetZoom,
    openCommandPalette,
  ])

  return null
}
