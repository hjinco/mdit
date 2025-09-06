import {
  MarkdownPlugin,
  type MdImage,
  remarkMdx,
  remarkMention,
} from '@platejs/markdown'
import { relative, resolve } from 'pathe'
import { getPluginType, KEYS, type TText } from 'platejs'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import YAML from 'yaml'
import { useTabStore } from '@/store/tab-store'
import { FRONTMATTER_KEY } from './frontmatter-kit'

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
            const yaml = YAML.stringify(node?.data ?? {})
            const value = `---\n${yaml === '{}\n' ? '' : yaml}---`
            return { type: 'html', value }
          },
        },
        yaml: {
          deserialize: (mdastNode) => {
            return {
              type: FRONTMATTER_KEY,
              data: YAML.parse(mdastNode.value),
              children: [{ text: '' }],
            }
          },
        },
        img: {
          deserialize: (mdastNode, _, options) => {
            const tabPath = useTabStore.getState().tab?.path
            if (!tabPath) throw new Error('Tab path not found')

            const url = resolve(tabPath, mdastNode.url)

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

            const relUrl = relative(tabPath, url)

            const image: MdImage = {
              alt: caption
                ? caption.map((c) => (c as any).text).join('')
                : undefined,
              title: caption
                ? caption.map((c) => (c as any).text).join('')
                : undefined,
              type: 'image',
              url: relUrl,
            }

            // since plate is using block image so we need to wrap it in a paragraph
            return { children: [image], type: 'paragraph' } as any
          },
        },
      },
    },
  }),
]
