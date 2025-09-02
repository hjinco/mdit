import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { useChat as useBaseChat } from '@ai-sdk/react'
import { streamText } from 'ai'
import { usePluginOption } from 'platejs/react'
import { useEffect, useRef } from 'react'
import { aiChatPlugin } from '@/components/editor/plugins/ai-kit'

export const useChat = (
  config: {
    provider: string
    apiKey: string
    model: string
  } | null
) => {
  const options = usePluginOption(aiChatPlugin, 'chatOptions')

  const llmRef = useRef<any>(null)

  useEffect(() => {
    if (!config) return
    switch (config.provider) {
      case 'google':
        llmRef.current = createGoogleGenerativeAI({
          apiKey: config.apiKey,
        })(config.model)
        break
      default:
        throw new Error(`Unsupported provider: ${config.provider}`)
    }
  }, [config])

  const chat = useBaseChat({
    id: 'editor',
    fetch: async (_, init) => {
      if (!llmRef.current) throw new Error('LLM not found')
      const body = JSON.parse(init?.body?.toString() || '[]')
      const { system, messages } = body
      const res = streamText({
        model: llmRef.current,
        system,
        messages,
      })
      return res.toDataStreamResponse()
    },
    ...options,
  })

  return chat
}
