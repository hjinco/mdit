import { useEditorRef } from 'platejs/react'
import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { useTabStore } from '@/store/tab-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { installWindowMenu } from './menu'

export function WindowMenu() {
  const editor = useEditorRef()

  const { workspacePath, createNote } = useWorkspaceStore(
    useShallow((s) => ({
      workspacePath: s.workspacePath,
      createNote: s.createNote,
    }))
  )

  const openNote = useTabStore((s) => s.openNote)

  useEffect(() => {
    installWindowMenu({
      editor,
      createNote: async () => {
        if (workspacePath) {
          const filePath = await createNote(workspacePath)
          if (filePath) {
            openNote(filePath)
          }
        }
      },
    })
  }, [editor, workspacePath, createNote, openNote])

  return null
}
