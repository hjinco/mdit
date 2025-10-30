import {
  KEYS,
  type Path,
  PathApi,
  type SlateEditor,
  type TCodeBlockElement,
} from 'platejs'

function getCurrentCodeBlockEntry(editor: SlateEditor) {
  const options = {
    block: true,
    mode: 'lowest' as const,
    match: { type: editor.getType(KEYS.codeBlock) },
  }

  if (!editor.selection) {
    return editor.api.node<TCodeBlockElement>(options)
  }

  return editor.api.node<TCodeBlockElement>({
    ...options,
    at: editor.selection,
  })
}

function getPreviousCodeBlockEntry(editor: SlateEditor, currentPath: Path) {
  return editor.api.previous<TCodeBlockElement>({
    at: currentPath,
    block: true,
    mode: 'lowest',
    match: { type: editor.getType(KEYS.codeBlock) },
  })
}

export function applyPreviousCodeBlockLanguage(editor: SlateEditor) {
  const currentEntry = getCurrentCodeBlockEntry(editor)
  if (!currentEntry) return

  const [currentNode, path] = currentEntry
  const previousEntry = getPreviousCodeBlockEntry(editor, path)
  if (!previousEntry) return

  const [previousNode, previousPath] = previousEntry
  if (PathApi.equals(previousPath, path)) return

  const lang = previousNode.lang?.trim()
  if (!lang) return
  if (currentNode.lang === lang) return

  editor.tf.setNodes<TCodeBlockElement>({ lang }, { at: path })
}
