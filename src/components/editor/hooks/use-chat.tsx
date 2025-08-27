import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { useChat as useBaseChat } from '@ai-sdk/react'
import { streamText } from 'ai'
import { usePluginOption } from 'platejs/react'
import { useMemo } from 'react'
import { aiChatPlugin } from '@/components/editor/plugins/ai-kit'

export const useChat = (
  config: {
    provider: string
    apiKey: string
    model: string
  } | null
) => {
  const options = usePluginOption(aiChatPlugin, 'chatOptions')

  const llm = useMemo(() => {
    if (!config) return null
    switch (config.provider) {
      case 'google':
        return createGoogleGenerativeAI({
          apiKey: config.apiKey,
        })(config.model)
      default:
        throw new Error(`Unsupported provider: ${config.provider}`)
    }
  }, [config])

  const chat = useBaseChat({
    id: 'editor',
    fetch: async (_, init) => {
      if (!llm) throw new Error('LLM not found')
      const body = JSON.parse(init?.body?.toString() || '[]')
      const { system, messages } = body
      const res = streamText({
        model: llm,
        system,
        messages,
      })
      return res.toDataStreamResponse()
    },
    ...options,
  })

  return chat
}
