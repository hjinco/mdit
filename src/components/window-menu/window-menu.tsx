import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { useStore } from '@/store'
import { installWindowMenu } from './menu'

export function WindowMenu() {
  const {
    createAndOpenNote,
    openFolderPicker,
    toggleCollectionView,
    goBack,
    goForward,
  } = useStore(
    useShallow((s) => ({
      createAndOpenNote: s.createAndOpenNote,
      openFolderPicker: s.openFolderPicker,
      toggleCollectionView: s.toggleCollectionView,
      goBack: s.goBack,
      goForward: s.goForward,
    }))
  )

  const {
    toggleFileExplorer,
    openCommandMenu,
    toggleSettingsDialogOpen,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useStore(
    useShallow((s) => ({
      toggleFileExplorer: s.toggleFileExplorerOpen,
      openCommandMenu: s.openCommandMenu,
      toggleSettingsDialogOpen: s.toggleSettingsDialogOpen,
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
      toggleCollectionView,
      zoomIn,
      zoomOut,
      resetZoom,
      openCommandMenu,
      goBack,
      goForward,
      toggleSettings: toggleSettingsDialogOpen,
    })
  }, [
    createAndOpenNote,
    openFolderPicker,
    toggleFileExplorer,
    toggleCollectionView,
    zoomIn,
    zoomOut,
    resetZoom,
    openCommandMenu,
    goBack,
    goForward,
    toggleSettingsDialogOpen,
  ])

  return null
}
