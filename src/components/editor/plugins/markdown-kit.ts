import {
  MarkdownPlugin,
  type MdImage,
  remarkMdx,
  remarkMention,
} from '@platejs/markdown'
import { dirname, relative, resolve } from 'pathe'
import { getPluginType, KEYS, type TText } from 'platejs'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import YAML from 'yaml'
import { useTabStore } from '@/store/tab-store'
import {
  convertValueToType,
  datePattern,
  type KVRow,
  type ValueType,
} from '../ui/node-frontmatter-table'
import { FRONTMATTER_KEY } from './frontmatter-kit'

function createRowId() {
  return Math.random().toString(36).slice(2, 9)
}

function rowsToRecord(
  data: KVRow[] | Record<string, unknown> | undefined
): Record<string, unknown> {
  if (Array.isArray(data)) {
    return data.reduce<Record<string, unknown>>((acc, row) => {
      if (!row.key) return acc
      acc[row.key] = convertValueToType(row.value, row.type)
      return acc
    }, {})
  }

  if (data && typeof data === 'object') {
    return data
  }

  return {}
}

function detectValueType(value: unknown): ValueType {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (Array.isArray(value)) return 'array'
  if (
    value instanceof Date ||
    (typeof value === 'string' &&
      !Number.isNaN(Date.parse(value)) &&
      datePattern.test(value))
  )
    return 'date'
  return 'string'
}

function toRowsFromRecord(value: unknown): KVRow[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []

  return Object.entries(value as Record<string, unknown>).map(([key, val]) => ({
    id: createRowId(),
    key,
    value: val,
    type: detectValueType(val),
  }))
}

function parseFrontmatterYaml(yamlSource: string): KVRow[] {
  try {
    return toRowsFromRecord(YAML.parse(yamlSource))
  } catch {
    return []
  }
}

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      disallowedNodes: [KEYS.slashCommand],
      remarkPlugins: [
        remarkMath,
        remarkGfm,
        remarkMdx,
        remarkMention,
        remarkFrontmatter,
      ],
      rules: {
        [FRONTMATTER_KEY]: {
          serialize: (node) => {
            const record = rowsToRecord(node?.data as any)
            const yaml = YAML.stringify(record)
            const value = `---\n${yaml === '{}\n' ? '' : yaml}---`
            return { type: 'html', value }
          },
        },
        yaml: {
          deserialize: (mdastNode) => {
            return {
              type: FRONTMATTER_KEY,
              data: parseFrontmatterYaml(mdastNode.value),
              children: [{ text: '' }],
            }
          },
        },
        img: {
          deserialize: (mdastNode, _, options) => {
            const tabPath = useTabStore.getState().tab?.path
            if (!tabPath) throw new Error('Tab path not found')

            const tabDir = dirname(tabPath)
            const url = resolve(tabDir, mdastNode.url)

            return {
              caption: [{ text: mdastNode.alt } as TText],
              children: [{ text: '' } as TText],
              type: getPluginType(options.editor!, KEYS.img),
              url,
            }
          },
          serialize: ({ caption, url }) => {
            const tabPath = useTabStore.getState().tab?.path
            if (!tabPath) throw new Error('Tab path not found')

            const tabDir = dirname(tabPath)
            const relUrl = relative(tabDir, url)
            const normalizedRelUrl = relUrl.startsWith('.')
              ? relUrl
              : `./${relUrl}`

            const image: MdImage = {
              alt: caption
                ? caption.map((c) => (c as any).text).join('')
                : undefined,
              title: caption
                ? caption.map((c) => (c as any).text).join('')
                : undefined,
              type: 'image',
              url: normalizedRelUrl,
            }

            // since plate is using block image so we need to wrap it in a paragraph
            return { children: [image], type: 'paragraph' } as any
          },
        },
      },
    },
  }),
]
