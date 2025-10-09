import { streamInsertChunk, withAIBatch } from '@platejs/ai'
import type { AIChatPluginConfig } from '@platejs/ai/react'
import {
  AIChatPlugin,
  AIPlugin,
  createFormattedBlocks,
  useChatChunk,
} from '@platejs/ai/react'
import { markdownToSlateNodes } from '@platejs/markdown'
import {
  BlockSelectionPlugin,
  removeBlockSelectionNodes,
} from '@platejs/selection/react'
import type { UseChatOptions } from 'ai/react'
import { getPluginType, KEYS, PathApi, type TElement } from 'platejs'
import { usePluginOption } from 'platejs/react'
import { toast } from 'sonner'
import { AILoadingBar } from '../ui/ai-loading-bar'
import { AIMenu } from '../ui/ai-menu'
import { AIAnchorElement } from '../ui/node-ai'
import { getDiff } from './diff-kit'

export const aiChatPlugin = AIChatPlugin.extend({
  options: {
    chatOptions: {
      api: '/api/ai/command',
      body: {},
    } as UseChatOptions,
    promptTemplate: ({ isBlockSelecting, isSelecting }) => {
      return isBlockSelecting
        ? PROMPT_TEMPLATES.userBlockSelecting
        : isSelecting
          ? PROMPT_TEMPLATES.userSelecting
          : PROMPT_TEMPLATES.userDefault
    },
    systemTemplate: ({ isBlockSelecting, isSelecting }) => {
      return isBlockSelecting
        ? PROMPT_TEMPLATES.systemBlockSelecting
        : isSelecting
          ? PROMPT_TEMPLATES.systemSelecting
          : PROMPT_TEMPLATES.systemDefault
    },
  },
  render: {
    afterContainer: AILoadingBar,
    afterEditable: AIMenu,
    node: AIAnchorElement,
  },
  shortcuts: { show: { keys: 'mod+j' } },
  useHooks: ({ editor }) => {
    const mode = usePluginOption(
      { key: KEYS.aiChat } as AIChatPluginConfig,
      'mode'
    )

    useChatChunk({
      onChunk: ({ chunk, isFirst, nodes }) => {
        if (isFirst) {
          if (mode === 'insert') {
            const selection = editor.selection
            if (!selection) return

            editor.tf.withoutSaving(() => {
              editor.tf.insertNodes(
                {
                  children: [{ text: '' }],
                  type: getPluginType(editor, KEYS.aiChat),
                },
                {
                  at: PathApi.next(selection.focus.path.slice(0, 1)),
                }
              )
            })
          } else if (mode === 'chat') {
            const isBlockSelecting = editor.getOption(
              BlockSelectionPlugin,
              'isSelectingSome'
            )
            editor.tf.withoutSaving(() => {
              editor.tf.insertNodes(
                {
                  children: [{ text: '' }],
                  type: getPluginType(editor, KEYS.aiChat),
                },
                {
                  at: isBlockSelecting
                    ? PathApi.next(
                        editor
                          .getApi(BlockSelectionPlugin)
                          .blockSelection.getNodes()
                          .at(-1)![1]
                      )
                    : PathApi.next(editor.selection!.focus.path.slice(0, 1)),
                }
              )
            })
          }

          // setTimeout ensures ai-menu.tsx can properly find the anchor DOM node
          setTimeout(() => {
            editor.setOption(AIChatPlugin, 'streaming', true)
          }, 0)
        }

        if (nodes.length < 1) {
          return
        }

        if (mode === 'insert') {
          withAIBatch(
            editor,
            () => {
              editor.tf.withScrolling(() => {
                streamInsertChunk(editor, chunk, {
                  textProps: {
                    diff: true,
                    diffOperation: {
                      type: 'insert',
                    },
                  },
                })
              })
            },
            { split: isFirst }
          )
        }
      },
      onFinish: ({ content }) => {
        const resetStreamingState = () => {
          editor.setOption(AIChatPlugin, 'streaming', false)
          editor.setOption(AIChatPlugin, '_blockChunks', '')
          editor.setOption(AIChatPlugin, '_blockPath', null)
        }

        const chatState = editor.getOption(AIChatPlugin, 'chat')
        const isChatError =
          chatState?.status === 'error' || chatState?.error !== undefined

        if (isChatError) {
          resetStreamingState()
          if (mode === 'chat') {
            editor.setOption(AIChatPlugin, 'open', true)
          } else {
            editor.getTransforms(AIChatPlugin).aiChat.removeAnchor()
          }
          toast.error('Error occurred. Please try again.')
          return
        }

        if (mode === 'chat') {
          const isBlockSelecting = editor.getOption(
            BlockSelectionPlugin,
            'isSelectingSome'
          )

          if (isBlockSelecting) {
            const blockSelection =
              editor.getApi(BlockSelectionPlugin).blockSelection
            const selectedBlocks = blockSelection.getNodes()

            if (selectedBlocks.length === 0) return

            if (selectedBlocks.length === 1) {
              const [, firstBlockPath] = selectedBlocks[0]
              const formattedBlocks = createFormattedBlocks({
                blocks: markdownToSlateNodes(editor, content),
                format: 'single',
                sourceBlock: selectedBlocks[0],
              })

              if (!formattedBlocks) return

              const diff = getDiff([selectedBlocks[0][0]], formattedBlocks)

              editor.tf.withoutNormalizing(() => {
                removeBlockSelectionNodes(editor)

                editor.tf.withNewBatch(() => {
                  editor
                    .getTransforms(BlockSelectionPlugin)
                    .blockSelection.insertBlocksAndSelect(diff as TElement[], {
                      at: firstBlockPath,
                    })
                })
              })
            } else {
              const nodes = markdownToSlateNodes(editor, content)
              const diff = getDiff(
                selectedBlocks.map(([b]) => b),
                nodes
              )

              editor.tf.withoutNormalizing(() => {
                removeBlockSelectionNodes(editor)

                editor.tf.withNewBatch(() => {
                  editor
                    .getTransforms(BlockSelectionPlugin)
                    .blockSelection.insertBlocksAndSelect(diff as TElement[], {
                      at: selectedBlocks[0][1],
                    })
                })
              })
            }
          } else {
            const firstBlock = editor.api.node({
              block: true,
              mode: 'lowest',
            })

            if (
              firstBlock &&
              editor.api.isSelected(firstBlock[1], { contains: true })
            ) {
              const blocks = markdownToSlateNodes(editor, content)
              const formattedBlocks = createFormattedBlocks({
                blocks,
                format: 'single',
                sourceBlock: firstBlock,
              })

              if (!formattedBlocks) return

              /** When user selection is cover the whole code block */
              if (
                firstBlock[0].type === KEYS.codeLine &&
                blocks[0].type === KEYS.codeBlock &&
                blocks.length === 1
              ) {
                const diff = getDiff(
                  editor.api.fragment(),
                  formattedBlocks[0].children
                )
                editor.tf.insertFragment(diff)
              } else {
                const diff = getDiff(editor.api.fragment(), formattedBlocks)
                editor.tf.insertFragment(diff)
              }
            } else {
              const nodes = markdownToSlateNodes(editor, content)
              const diff = getDiff(editor.api.fragment(), nodes)
              editor.tf.insertFragment(diff)
            }
          }
        }

        resetStreamingState()
      },
    })
  },
})

export const AIKit = [AIPlugin, aiChatPlugin]

const systemCommon = `\
You are an advanced AI-powered note-taking assistant, designed to enhance productivity and creativity in note management.
Respond directly to user prompts with clear, concise, and relevant content. Maintain a neutral, helpful tone.

Rules:
- <Document> is the entire note the user is working on.
- <Reminder> is a reminder of how you should reply to INSTRUCTIONS. It does not apply to questions.
- Anything else is the user prompt.
- Your response should be tailored to the user's prompt, providing precise assistance to optimize note management.
- For INSTRUCTIONS: Follow the <Reminder> exactly. Provide ONLY the content to be inserted or replaced. No explanations or comments.
- For QUESTIONS: Provide a helpful and concise answer. You may include brief explanations if necessary.
- CRITICAL: DO NOT remove or modify the following custom MDX tags: <u>, <callout>, <kbd>, <toc>, <sub>, <sup>, <mark>, <del>, <date>, <span>, <column>, <column_group>, <file>, <audio>, <video> in <Selection> unless the user explicitly requests this change.
- CRITICAL: Distinguish between INSTRUCTIONS and QUESTIONS. Instructions typically ask you to modify or add content. Questions ask for information or clarification.
- CRITICAL: when asked to write in markdown, do not start with \`\`\`markdown.
- CRITICAL: When writing the column, such line breaks and indentation must be preserved.
<column_group>
  <column>
    1
  </column>
  <column>
    2
  </column>
  <column>
    3
  </column>
</column_group>
`

const systemDefault = `\
${systemCommon}
- <Block> is the current block of text the user is working on.
- Ensure your output can seamlessly fit into the existing <Block> structure.

<Block>
{block}
</Block>
`

const systemSelecting = `\
${systemCommon}
- <Block> is the block of text containing the user's selection, providing context.
- Ensure your output can seamlessly fit into the existing <Block> structure.
- <Selection> is the specific text the user has selected in the block and wants to modify or ask about.
- Consider the context provided by <Block>, but only modify <Selection>. Your response should be a direct replacement for <Selection>.
<Block>
{block}
</Block>
<Selection>
{selection}
</Selection>
`

const systemBlockSelecting = `\
${systemCommon}
- <Selection> represents the full blocks of text the user has selected and wants to modify or ask about.
- Your response should be a direct replacement for the entire <Selection>.
- Maintain the overall structure and formatting of the selected blocks, unless explicitly instructed otherwise.
- CRITICAL: Provide only the content to replace <Selection>. Do not add additional blocks or change the block structure unless specifically requested.
<Selection>
{block}
</Selection>
`

const userDefault = `<Reminder>
CRITICAL: NEVER write <Block>.
</Reminder>
{prompt}`
const userSelecting = `<Reminder>
If this is a question, provide a helpful and concise answer about <Selection>.
If this is an instruction, provide ONLY the text to replace <Selection>. No explanations.
Ensure it fits seamlessly within <Block>. If <Block> is empty, write ONE random sentence.
NEVER write <Block> or <Selection>.
</Reminder>
{prompt} about <Selection>`

const userBlockSelecting = `<Reminder>
If this is a question, provide a helpful and concise answer about <Selection>.
If this is an instruction, provide ONLY the content to replace the entire <Selection>. No explanations.
Maintain the overall structure unless instructed otherwise.
NEVER write <Block> or <Selection>.
</Reminder>
{prompt} about <Selection>`

export const PROMPT_TEMPLATES = {
  systemBlockSelecting,
  systemDefault,
  systemSelecting,
  userBlockSelecting,
  userDefault,
  userSelecting,
}
