import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import {
  CameraIcon,
  CheckIcon,
  Loader2Icon,
  SendIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useScreenCapture } from '@/contexts/screen-capture-context'
import { Button } from '@/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/ui/field'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/ui/form'
import { Input } from '@/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { Textarea } from '@/ui/textarea'

const formSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  email: z
    .string()
    .refine((val) => val === '' || z.email().safeParse(val).success, {
      message: 'Invalid email',
    })
    .optional(),
})

type FormValues = z.infer<typeof formSchema>

type SubmitStatus = 'idle' | 'loading' | 'success' | 'error'

export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle')
  const { onStartCapture, screenshot, setScreenshot, isCapturing } =
    useScreenCapture()
  const wasOpenBeforeCapture = useRef(false)
  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(formSchema),
    defaultValues: {
      message: '',
      email: '',
    },
  })

  useEffect(() => {
    if (submitStatus === 'success') {
      const timer = setTimeout(() => {
        setOpen(false)
        setTimeout(() => {
          setSubmitStatus('idle')
          form.reset()
          setScreenshot('')
        }, 300)
      }, 1500)
      return () => clearTimeout(timer)
    }
    if (submitStatus === 'error') {
      const timer = setTimeout(() => {
        setSubmitStatus('idle')
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [submitStatus, form, setScreenshot])

  // Reopen popover when screenshot capture is complete
  useEffect(() => {
    if (!isCapturing && wasOpenBeforeCapture.current) {
      // Reopen popover if it was open before capture started
      setOpen(true)
      wasOpenBeforeCapture.current = false
    }
  }, [isCapturing])

  const handleRemoveScreenshot = () => {
    setScreenshot('')
  }

  const onSubmit = async (values: FormValues) => {
    setSubmitStatus('loading')
    try {
      const response = await fetch(import.meta.env.VITE_FEEDBACK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: values.message,
          email: values.email || undefined,
          screenshot: screenshot || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to send feedback: ${response.statusText}`)
      }

      setSubmitStatus('success')
    } catch (error) {
      console.error('Failed to send feedback:', error)
      setSubmitStatus('error')
    }
  }

  if (!import.meta.env.VITE_FEEDBACK_API_URL) {
    // Hide feedback button if API URL is not configured
    return null
  }

  return (
    <Popover
      open={open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen)
        if (!newOpen) {
          setTimeout(() => {
            form.reset()
            setSubmitStatus('idle')
            setScreenshot('')
          }, 300)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="text-foreground/80 justify-start hover:bg-background/40"
          size="sm"
        >
          <SendIcon /> Feedback
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel>Email (optional)</FieldLabel>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="your@email.com"
                        />
                      </FormControl>
                      {fieldState.error && (
                        <FormMessage>{fieldState.error.message}</FormMessage>
                      )}
                    </FormItem>
                  )}
                />
              </Field>
              <Field>
                <FieldLabel>Feedback</FieldLabel>
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Share your feedback..."
                          className="h-32"
                          spellCheck="false"
                        />
                      </FormControl>
                      {fieldState.error && (
                        <FormMessage>{fieldState.error.message}</FormMessage>
                      )}
                    </FormItem>
                  )}
                />
              </Field>
              <Field>
                <FieldLabel>Screenshot (optional)</FieldLabel>
                <div className="space-y-2">
                  {screenshot ? (
                    <div className="relative">
                      <div
                        className="w-full rounded-md border max-h-48 min-h-32 bg-center bg-no-repeat bg-contain"
                        style={{ backgroundImage: `url(${screenshot})` }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 size-6"
                        onClick={handleRemoveScreenshot}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        wasOpenBeforeCapture.current = open
                        setOpen(false)
                        onStartCapture()
                      }}
                      className="w-full"
                    >
                      <CameraIcon />
                      Capture Screenshot
                    </Button>
                  )}
                </div>
              </Field>
            </FieldGroup>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false)
                  setTimeout(() => {
                    form.reset()
                    setSubmitStatus('idle')
                    setScreenshot('')
                  }, 300)
                }}
                disabled={
                  submitStatus === 'loading' || submitStatus === 'success'
                }
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                variant={submitStatus === 'error' ? 'destructive' : 'default'}
                disabled={
                  submitStatus === 'loading' || submitStatus === 'success'
                }
              >
                {submitStatus === 'loading' && (
                  <Loader2Icon className="size-4 animate-spin" />
                )}
                {submitStatus === 'success' && <CheckIcon className="size-4" />}
                {submitStatus === 'loading'
                  ? 'Sending'
                  : submitStatus === 'success'
                    ? 'Sent!'
                    : submitStatus === 'error'
                      ? 'Failed to send'
                      : 'Send'}
              </Button>
            </div>
          </form>
        </Form>
      </PopoverContent>
    </Popover>
  )
}
