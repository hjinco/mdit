import type { PlateEditor } from 'platejs/react'
import { useEffect, useRef } from 'react'
import { useStore } from '@/store'

/**
 * Save and restore editor selection when command menu opens/closes.
 * When the command menu opens, saves the current selection.
 * When it closes, restores the saved selection.
 */
export function useCommandMenuSelectionRestore(editor: PlateEditor) {
  const savedSelectionRef = useRef<typeof editor.selection>(null)
  const isCommandMenuOpen = useStore((s) => s.isCommandMenuOpen)

  useEffect(() => {
    if (isCommandMenuOpen) {
      // Save selection when command menu opens
      if (editor.selection) {
        savedSelectionRef.current = editor.selection
      }
    } else if (savedSelectionRef.current) {
      // Restore selection when command menu closes
      // Use setTimeout to ensure the editor is ready after the menu closes
      const selectionToRestore = savedSelectionRef.current
      savedSelectionRef.current = null
      setTimeout(() => {
        try {
          if (selectionToRestore) {
            editor.tf.select(selectionToRestore)
            editor.tf.focus()
          }
        } catch {
          // Selection might be invalid if content changed, ignore
        }
      }, 0)
    }
  }, [isCommandMenuOpen, editor])
}
