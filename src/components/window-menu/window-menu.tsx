import { useEditorRef } from 'platejs/react'
import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { useTabStore } from '@/store/tab-store'
import { installWindowMenu } from './menu'

export function WindowMenu() {
  const editor = useEditorRef()

  const { newNote, openNote } = useTabStore(
    useShallow((s) => ({ newNote: s.newNote, openNote: s.openNote }))
  )

  useEffect(() => {
    installWindowMenu({
      editor,
      newNote,
      openNote,
    })
  }, [newNote, openNote, editor])

  return null
}
