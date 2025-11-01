import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { useFontScaleStore } from '@/store/font-scale-store'
import { useTabStore } from '@/store/tab-store'
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

  const { toggleFileExplorer, openCommandMenu } = useUIStore(
    useShallow((s) => ({
      toggleFileExplorer: s.toggleFileExplorer,
      openCommandMenu: s.openCommandMenu,
    }))
  )
  const { zoomIn, zoomOut, resetZoom } = useFontScaleStore(
    useShallow((s) => ({
      zoomIn: s.increaseFontScale,
      zoomOut: s.decreaseFontScale,
      resetZoom: s.resetFontScale,
    }))
  )
  const { goBack, goForward } = useTabStore(
    useShallow((s) => ({
      goBack: s.goBack,
      goForward: s.goForward,
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
      openCommandMenu,
      goBack,
      goForward,
    })
  }, [
    createAndOpenNote,
    openFolderPicker,
    toggleFileExplorer,
    zoomIn,
    zoomOut,
    resetZoom,
    openCommandMenu,
    goBack,
    goForward,
  ])

  return null
}
