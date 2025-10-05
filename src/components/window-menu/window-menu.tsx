import { useEditorRef } from 'platejs/react'
import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
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

  useEffect(() => {
    installWindowMenu({
      editor,
      createNote: createAndOpenNote,
      openWorkspace: () => openFolderPicker(),
      toggleFileExplorer,
    })
  }, [editor, createAndOpenNote, openFolderPicker, toggleFileExplorer])

  return null
}
