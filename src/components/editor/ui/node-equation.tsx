import { useEquationElement, useEquationInput } from '@platejs/math/react'
import { CornerDownLeftIcon, RadicalIcon } from 'lucide-react'
import type { TEquationElement } from 'platejs'
import { PathApi } from 'platejs'
import type { PlateElementProps } from 'platejs/react'
import {
  createPrimitiveComponent,
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useElement,
  useReadOnly,
  useSelected,
} from 'platejs/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import TextareaAutosize, {
  type TextareaAutosizeProps,
} from 'react-textarea-autosize'
import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'

export function EquationElement(props: PlateElementProps<TEquationElement>) {
  const selected = useSelected()
  const [open, setOpen] = useState(selected)
  const katexRef = useRef<HTMLDivElement | null>(null)
  const editor = useEditorRef()
  const elementPathRef = useRef<ReturnType<typeof props.api.findPath>>(null)

  // Update element path ref when element changes
  const currentPath = props.api.findPath(props.element)
  if (
    currentPath &&
    (!elementPathRef.current ||
      !PathApi.equals(currentPath, elementPathRef.current))
  ) {
    elementPathRef.current = currentPath
  }
  const elementPath = elementPathRef.current

  // Check if the current selection is within this equation element
  const isFocused = useEditorSelector((editor) => {
    const selection = editor.selection
    if (!selection || !elementPath) return false

    // Check if selection is within this element's path
    const blockEntry = editor.api.above({
      at: selection,
      match: editor.api.isBlock,
      mode: 'lowest',
    })

    if (!blockEntry) return false

    const [, blockPath] = blockEntry
    return PathApi.equals(blockPath, elementPath)
  }, [])

  // Handle Enter key to open popover when element is focused
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        // Check if still focused before opening
        const selection = editor.selection
        if (!selection || !elementPathRef.current) return

        const blockEntry = editor.api.above({
          at: selection,
          match: editor.api.isBlock,
          mode: 'lowest',
        })

        if (!blockEntry) return

        const [, blockPath] = blockEntry
        if (PathApi.equals(blockPath, elementPathRef.current)) {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }
      }
    },
    [editor]
  )

  useEffect(() => {
    if (!isFocused || open || !elementPath) return

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFocused, open, elementPath, handleKeyDown])

  useEquationElement({
    element: props.element,
    katexRef,
    options: {
      displayMode: true,
      errorColor: '#cc0000',
      fleqn: false,
      leqno: false,
      macros: { '\\f': '#1f(#2)' },
      output: 'htmlAndMathml',
      strict: 'warn',
      throwOnError: false,
      trust: false,
    },
  })

  return (
    <PlateElement className="my-1" {...props}>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <div
            className={cn(
              'min-h-16 group flex cursor-pointer items-center justify-center rounded-sm select-none hover:bg-primary/10 data-[selected=true]:bg-primary/10',
              'w-full max-w-full min-w-0 overflow-x-auto',
              props.element.texExpression.length === 0
                ? 'bg-muted p-3 pr-9'
                : 'px-2 py-1'
            )}
            data-selected={selected}
            contentEditable={false}
          >
            {props.element.texExpression.length > 0 ? (
              <span ref={katexRef} />
            ) : (
              <div className="flex h-7 w-full items-center gap-2 text-sm whitespace-nowrap text-muted-foreground">
                <RadicalIcon className="size-6 text-muted-foreground/80" />
                <div>Add a Tex equation</div>
              </div>
            )}
          </div>
        </PopoverTrigger>

        <EquationPopoverContent
          open={open}
          placeholder={
            'f(x) = \\begin{cases}\n  x^2, &\\quad x > 0 \\\\\n  0, &\\quad x = 0 \\\\\n  -x^2, &\\quad x < 0\n\\end{cases}'
          }
          isInline={false}
          setOpen={setOpen}
        />
      </Popover>

      {props.children}
    </PlateElement>
  )
}

export function InlineEquationElement(
  props: PlateElementProps<TEquationElement>
) {
  const element = props.element
  const katexRef = useRef<HTMLDivElement | null>(null)
  const selected = useSelected()
  const isCollapsed = useEditorSelector(
    (editor) => editor.api.isCollapsed(),
    []
  )
  const [open, setOpen] = useState(selected && isCollapsed)

  useEffect(() => {
    if (selected && isCollapsed) {
      setOpen(true)
    }
  }, [selected, isCollapsed])

  useEquationElement({
    element,
    katexRef,
    options: {
      displayMode: true,
      errorColor: '#cc0000',
      fleqn: false,
      leqno: false,
      macros: { '\\f': '#1f(#2)' },
      output: 'htmlAndMathml',
      strict: 'warn',
      throwOnError: false,
      trust: false,
    },
  })

  return (
    <PlateElement
      {...props}
      className={cn(
        'mx-1 inline-block rounded-sm select-none [&_.katex-display]:my-0!'
      )}
    >
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <div
            className={cn(
              'after:absolute after:inset-0 after:-top-0.5 after:-left-1 after:z-1 after:h-[calc(100%)+4px] after:w-[calc(100%+8px)] after:rounded-sm after:content-[""]',
              'h-6',
              ((element.texExpression.length > 0 && open) || selected) &&
                'after:bg-brand/15',
              element.texExpression.length === 0 &&
                'text-muted-foreground after:bg-neutral-500/10'
            )}
            contentEditable={false}
          >
            <span
              ref={katexRef}
              className={cn(
                element.texExpression.length === 0 && 'hidden',
                'font-mono leading-none'
              )}
            />
            {element.texExpression.length === 0 && (
              <span>
                <RadicalIcon className="mr-1 inline-block h-[19px] w-4 py-[1.5px] align-text-bottom" />
                New equation
              </span>
            )}
          </div>
        </PopoverTrigger>

        <EquationPopoverContent
          className="my-auto"
          open={open}
          placeholder="E = mc^2"
          setOpen={setOpen}
          isInline
        />
      </Popover>

      {props.children}
    </PlateElement>
  )
}

const EquationInput = createPrimitiveComponent(TextareaAutosize)({
  propsHook: useEquationInput,
})

const EquationPopoverContent = ({
  className,
  isInline,
  open,
  setOpen,
  ...props
}: {
  isInline: boolean
  open: boolean
  setOpen: (open: boolean) => void
} & TextareaAutosizeProps) => {
  const editor = useEditorRef()
  const readOnly = useReadOnly()
  const element = useElement<TEquationElement>()

  useEffect(() => {
    if (isInline && open) {
      setOpen(true)
    }
  }, [isInline, open, setOpen])

  if (readOnly) return null

  const onClose = () => {
    if (isInline) {
      setOpen(false)
      editor.tf.select(element, { focus: true, next: true })
    } else {
      // Find the next block after the equation
      const nextNodeEntry = editor.api.next({ at: element, from: 'after' })

      if (nextNodeEntry) {
        const [, nextPath] = nextNodeEntry
        setOpen(false)
        // Use setTimeout to ensure popover closes before setting selection
        setTimeout(() => {
          const startPoint = editor.api.start(nextPath)
          if (startPoint) {
            // Select only the start position (collapsed selection)
            editor.tf.select({
              anchor: startPoint,
              focus: startPoint,
            })
            editor.tf.focus()
          }
        }, 0)
        return
      }

      setOpen(false)
      // No next block exists, just focus the editor
      setTimeout(() => {
        editor.tf.focus()
      }, 0)
    }
  }

  return (
    <PopoverContent
      className={cn(
        'flex gap-2 p-1',
        !isInline && 'w-[var(--radix-popover-trigger-width)]'
      )}
      contentEditable={false}
      align="start"
    >
      <EquationInput
        className={cn(
          'max-h-[50vh] grow resize-none p-2 text-sm outline-none',
          className
        )}
        state={{ isInline, open, onClose }}
        autoFocus
        spellCheck={false}
        autoCapitalize="off"
        onKeyDown={(e) => {
          // Handle Shift+Enter to complete input
          if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onClose()
            return
          }

          // Handle ArrowLeft at first position for inline equations
          if (e.key === 'ArrowLeft' && isInline) {
            const textarea = e.currentTarget as HTMLTextAreaElement
            if (textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
              const path = editor.api.findPath(element)
              if (path) {
                const beforePoint = editor.api.before(path)
                if (beforePoint) {
                  setTimeout(() => {
                    editor.tf.select({
                      anchor: beforePoint,
                      focus: beforePoint,
                    })
                    editor.tf.focus()
                  }, 0)
                }
              }
              return
            }
          }

          // Handle ArrowRight at last position for inline equations
          if (e.key === 'ArrowRight' && isInline) {
            const textarea = e.currentTarget as HTMLTextAreaElement
            if (textarea.selectionStart === textarea.value.length) {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
              setTimeout(() => {
                editor.tf.select(element, { focus: true, next: true })
                editor.tf.focus()
              }, 0)
              return
            }
          }

          // Handle Cut (Ctrl+X / Cmd+X)
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') {
            e.preventDefault()
            e.stopPropagation()
            const textarea = e.currentTarget as HTMLTextAreaElement
            if (
              textarea &&
              textarea.selectionStart !== null &&
              textarea.selectionEnd !== null
            ) {
              const selectedText = textarea.value.substring(
                textarea.selectionStart,
                textarea.selectionEnd
              )
              if (selectedText) {
                navigator.clipboard.writeText(selectedText).then(() => {
                  const newValue =
                    textarea.value.substring(0, textarea.selectionStart!) +
                    textarea.value.substring(textarea.selectionEnd!)
                  textarea.value = newValue
                  textarea.dispatchEvent(new Event('input', { bubbles: true }))
                  textarea.setSelectionRange(
                    textarea.selectionStart!,
                    textarea.selectionStart!
                  )
                })
              }
            }
            return
          }

          // Handle Copy (Ctrl+C / Cmd+C)
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault()
            e.stopPropagation()
            const textarea = e.currentTarget as HTMLTextAreaElement
            if (
              textarea &&
              textarea.selectionStart !== null &&
              textarea.selectionEnd !== null
            ) {
              const selectedText = textarea.value.substring(
                textarea.selectionStart,
                textarea.selectionEnd
              )
              if (selectedText) {
                navigator.clipboard.writeText(selectedText)
              }
            }
            return
          }
        }}
        {...props}
      />

      <Button variant="secondary" className="px-3" onClick={onClose}>
        Done <CornerDownLeftIcon className="size-3.5" />
      </Button>
    </PopoverContent>
  )
}
