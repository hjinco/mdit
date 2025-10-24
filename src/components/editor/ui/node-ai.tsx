import { AIChatPlugin } from '@platejs/ai/react'
import {
  PlateElement,
  type PlateElementProps,
  PlateText,
  type PlateTextProps,
  usePluginOption,
} from 'platejs/react'
import { cn } from '@/lib/utils'

export function AILeaf(props: PlateTextProps) {
  const streaming = usePluginOption(AIChatPlugin, 'streaming')
  const streamingLeaf = props.editor
    .getApi(AIChatPlugin)
    .aiChat.node({ streaming: true })
  const isLast = streamingLeaf?.[0] === props.text
  return (
    <PlateText
      className={cn(
        'bg-blue-500/10 text-blue-400 no-underline',
        'transition-all duration-200 ease-in-out',
        isLast &&
          streaming &&
          'after:ml-1.5 after:inline-block after:h-3 after:w-3 after:rounded-full after:bg-primary after:align-middle after:content-[""]'
      )}
      {...props}
    />
  )
}

export function AIAnchorElement(props: PlateElementProps) {
  return (
    <PlateElement {...props}>
      <div className="h-[0.1px]" />
    </PlateElement>
  )
}
