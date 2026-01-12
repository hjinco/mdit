import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { useCollectionStore } from '@/store/collection-store'
import { useTabStore } from '@/store/tab-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceFsStore } from '@/store/workspace-fs-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { installWindowMenu } from './menu'

export function WindowMenu() {
  const createAndOpenNote = useWorkspaceFsStore((s) => s.createAndOpenNote)
  const { openFolderPicker } = useWorkspaceStore(
    useShallow((s) => ({
      openFolderPicker: s.openFolderPicker,
    }))
  )
  const { toggleCollectionView } = useCollectionStore(
    useShallow((s) => ({
      toggleCollectionView: s.toggleCollectionView,
    }))
  )

  const {
    toggleFileExplorer,
    openCommandMenu,
    toggleSettingsDialogOpen,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useUIStore(
    useShallow((s) => ({
      toggleFileExplorer: s.toggleFileExplorerOpen,
      openCommandMenu: s.openCommandMenu,
      toggleSettingsDialogOpen: s.toggleSettingsDialogOpen,
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
