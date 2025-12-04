import {
  Plate,
  PlateContainer,
  PlateContent,
  usePlateEditor,
} from 'platejs/react'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { isMac } from '@/utils/platform'
import { EditorKit } from '../editor/plugins/editor-kit'

export function QuickNote() {
  const editor = usePlateEditor({ plugins: EditorKit })

  useEffect(() => {
    editor.tf.focus()
  }, [editor])

  return (
    <div className="size-full">
      <div
        className="h-12 w-full"
        {...(isMac() && { 'data-tauri-drag-region': '' })}
      />
      <Plate editor={editor}>
        <PlateContainer
          className={cn(
            'ignore-click-outside/toolbar',
            'relative w-full h-full cursor-text overflow-y-auto caret-primary select-text selection:bg-brand/14 focus-visible:outline-none [&_.slate-selection-area]:z-50 [&_.slate-selection-area]:border [&_.slate-selection-area]:border-brand/25 [&_.slate-selection-area]:bg-brand/14'
          )}
        >
          <PlateContent
            className={cn(
              'group/editor',
              'relative cursor-text overflow-x-hidden break-words whitespace-pre-wrap select-text',
              'rounded-md ring-offset-background focus-visible:outline-none',
              'placeholder:text-muted-foreground/80 **:data-slate-placeholder:!top-1/2 **:data-slate-placeholder:-translate-y-1/2 **:data-slate-placeholder:text-muted-foreground/80 **:data-slate-placeholder:opacity-100!',
              '[&_strong]:font-bold',
              'size-full px-12 pt-4 pb-72 text-base sm:px-[max(64px,calc(50%-350px))] text-foreground/85 font-scale-scope'
            )}
            autoCapitalize="off"
            spellCheck={false}
            disableDefaultStyles
          />
        </PlateContainer>
      </Plate>
    </div>
  )
}
