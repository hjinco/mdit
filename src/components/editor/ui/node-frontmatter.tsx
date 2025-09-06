import type { PlateElementProps } from 'platejs/react'
import { PlateElement, useEditorRef } from 'platejs/react'
import { useMemo } from 'react'
import {
  detectValueType,
  FrontmatterTable,
  type KVRow,
} from './node-frontmatter-table'

type FrontmatterRecord = Record<string, unknown>

export type TFrontmatterElement = {
  type: 'frontmatter'
  data: FrontmatterRecord
  children: [{ text: string }]
}

function toRows(obj: FrontmatterRecord): KVRow[] {
  return Object.entries(obj).map(([key, value]) => ({
    id: uid(),
    key,
    value,
    type: detectValueType(value),
  }))
}

function toObject(rows: KVRow[]): FrontmatterRecord {
  const out: FrontmatterRecord = {}
  for (const r of rows) {
    if (!r.key) continue
    out[r.key] = r.value
  }
  return out
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export function FrontmatterElement(
  props: PlateElementProps<TFrontmatterElement>
) {
  const editor = useEditorRef()
  const element = props.element as TFrontmatterElement
  const data = element.data ?? {}

  const rows = useMemo(() => toRows(data), [data])

  const handleDataChange = (nextRows: KVRow[]) => {
    if (nextRows.length === 0) {
      editor.tf.removeNodes({ at: [0] })
      return
    }
    const nextData = toObject(nextRows)
    const path = props.api.findPath(element)

    if (path) {
      editor.tf.setNodes({ data: nextData }, { at: path })
    }
  }

  return (
    <PlateElement {...props} className="mb-4">
      <div
        className="flex flex-col select-none text-muted-foreground"
        contentEditable={false}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <FrontmatterTable data={rows} onChange={handleDataChange} />
      </div>
    </PlateElement>
  )
}
