import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/ui/form'
import { Input } from '@/ui/input'
import { Textarea } from '@/ui/textarea'
import type { Command } from '../hooks/use-ai-commands'

const formSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  prompt: z.string().min(1, 'Prompt is required'),
})

type FormValues = z.infer<typeof formSchema>

type Props = {
  onAdd: (command: Command) => void
  onClose: () => void
}

export function AIMenuAddCommand({ onAdd, onClose }: Props) {
  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(formSchema),
    defaultValues: {
      label: '',
      prompt: '',
    },
  })

  function onSubmit(values: FormValues) {
    onAdd({
      type: 'selectionCommand',
      label: values.label,
      prompt: values.prompt,
    })
    form.reset()
    onClose()
  }

  function handleCancel() {
    form.reset()
    onClose()
  }

  return (
    <div className="w-full rounded-lg border shadow-md bg-background p-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-3">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">Label</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Translate to Korean"
                      className="h-8"
                      autoComplete="off"
                      spellCheck="false"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">Prompt</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Translate this to Korean"
                      autoComplete="off"
                      spellCheck="false"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Add
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
