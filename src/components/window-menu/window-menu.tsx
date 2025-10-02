import { useEditorRef } from 'platejs/react'
import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
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

  useEffect(() => {
    installWindowMenu({
      editor,
      createNote: createAndOpenNote,
      openWorkspace: () => openFolderPicker(),
    })
  }, [editor, createAndOpenNote, openFolderPicker])

  return null
}
