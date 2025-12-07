import type { PlateElementProps } from 'platejs/react'
import { PlateElement, useEditorRef } from 'platejs/react'
import { FrontmatterTable, type KVRow } from './node-frontmatter-table'

export type TFrontmatterElement = {
  type: 'frontmatter'
  data: KVRow[]
  children: [{ text: string }]
}

export function FrontmatterElement(
  props: PlateElementProps<TFrontmatterElement>
) {
  const editor = useEditorRef()
  const element = props.element as TFrontmatterElement

  const handleDataChange = (nextRows: KVRow[]) => {
    if (nextRows.length === 0) {
      editor.tf.removeNodes({ at: [0] })
      return
    }
    const path = props.api.findPath(element)

    if (path) {
      editor.tf.setNodes({ data: nextRows }, { at: path })
    }
  }

  return (
    <PlateElement {...props} className="mb-4">
      <div
        className="flex flex-col select-none text-muted-foreground overflow-x-auto"
        contentEditable={false}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <FrontmatterTable data={element.data} onChange={handleDataChange} />
      </div>
    </PlateElement>
  )
}
