import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { CheckIcon, Loader2Icon, SendIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
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
        setSubmitStatus('idle')
        form.reset()
      }, 1500)
      return () => clearTimeout(timer)
    }
    if (submitStatus === 'error') {
      const timer = setTimeout(() => {
        setSubmitStatus('idle')
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [submitStatus, form])

  const onSubmit = async (values: FormValues) => {
    setSubmitStatus('loading')
    try {
      const response = await fetch('https://mdit.app/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: values.message,
          email: values.email || undefined,
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

  return (
    <Popover
      open={open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen)
        if (!newOpen) {
          form.reset()
          setSubmitStatus('idle')
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="text-foreground/70 justify-start"
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
            </FieldGroup>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  form.reset()
                  setOpen(false)
                  setSubmitStatus('idle')
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
