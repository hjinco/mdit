import { useEffect } from 'react'
import { useTabContext } from '@/contexts/tab-context'
import { installWindowMenu } from './menu'

export function WindowMenu() {
  const { newNote, openNote } = useTabContext()

  useEffect(() => {
    installWindowMenu({
      newNote,
      openNote,
    })
  }, [newNote, openNote])

  return null
}
