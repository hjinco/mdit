import { MarkdownPlugin, remarkMdx, remarkMention } from '@platejs/markdown'
import { KEYS, type TEquationElement } from 'platejs'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import YAML from 'yaml'
import {
  convertValueToType,
  datePattern,
  type KVRow,
  type ValueType,
} from '../ui/node-frontmatter-table'
import { FRONTMATTER_KEY } from './frontmatter-kit'

const EQUATION_ENVIRONMENT_REGEX =
  /^\\begin\{([^}]+)\}[\r\n]+([\s\S]*?)[\r\n]+\\end\{\1\}\s*$/

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
        [KEYS.equation]: {
          serialize: (node: TEquationElement) => {
            const environment = node.environment || 'equation'
            const texExpression = node.texExpression ?? ''
            const value = `\\begin{${environment}}\n${texExpression}\n\\end{${environment}}`

            return {
              type: 'math',
              value,
            }
          },
          deserialize: (mdastNode: { value: string }) => {
            const match = EQUATION_ENVIRONMENT_REGEX.exec(mdastNode.value)
            if (!match)
              return {
                type: KEYS.equation,
                texExpression: '',
                environment: 'equation',
                children: [{ text: '' }],
              }

            const [, environment, body] = match

            return {
              type: KEYS.equation,
              texExpression: body.trim(),
              environment,
              children: [{ text: '' }],
            }
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
      },
    },
  }),
]
