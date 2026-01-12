import {
  convertChildrenDeserialize,
  convertNodesSerialize,
  MarkdownPlugin,
  type MdMdxJsxFlowElement,
  parseAttributes,
  propsToAttributes,
  remarkMdx,
  remarkMention,
} from '@platejs/markdown'
import { getPluginType, KEYS, type TEquationElement } from 'platejs'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import YAML from 'yaml'
import {
  convertValueToType,
  datePattern,
  type ValueType,
} from '@/utils/frontmatter-value-utils'
import type { KVRow } from '../ui/node-frontmatter-table'
import { DATABASE_KEY } from './database-kit'
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
        callout: {
          deserialize: (mdastNode, deco, options) => {
            const props = parseAttributes(mdastNode.attributes)
            return {
              children: convertChildrenDeserialize(
                mdastNode.children,
                deco,
                options
              ),
              type: getPluginType(options.editor!, KEYS.callout),
              ...props,
            }
          },
          serialize(slateNode, options): MdMdxJsxFlowElement {
            const { icon, backgroundColor, variant } = slateNode
            const attributes = propsToAttributes({
              icon,
              backgroundColor,
              variant,
            }).filter((attribute) => attribute.value !== 'null')
            return {
              attributes,
              children: convertNodesSerialize(
                slateNode.children,
                options
              ) as any,
              name: 'callout',
              type: 'mdxJsxFlowElement',
            }
          },
        },
        database: {
          deserialize: (mdastNode, deco, options) => {
            const props = parseAttributes(mdastNode.attributes)
            return {
              children: convertChildrenDeserialize(
                mdastNode.children || [],
                deco,
                options
              ),
              ...props,
              folder: String(props.folder),
              sortOption: props.sortOption,
              sortDirection: props.sortDirection,
              type: getPluginType(options.editor!, DATABASE_KEY),
            }
          },
          serialize(slateNode, options): MdMdxJsxFlowElement {
            const attributes = propsToAttributes({
              folder: slateNode.folder ?? null,
              sortOption: slateNode.sortOption ?? null,
              sortDirection: slateNode.sortDirection ?? null,
            }).filter((attribute) => attribute.value !== 'null')
            return {
              attributes,
              children: convertNodesSerialize(
                slateNode.children,
                options
              ) as any,
              name: 'database',
              type: 'mdxJsxFlowElement',
            }
          },
        },
      },
    },
  }),
]
