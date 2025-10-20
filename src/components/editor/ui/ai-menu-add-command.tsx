import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/ui/field'
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FieldSet>
          <FieldLegend>Add Command</FieldLegend>
          <FieldDescription>Add a new command to the AI menu.</FieldDescription>
          <FieldGroup>
            <Controller
              name="label"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Label</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    placeholder="Summarize text"
                    autoComplete="off"
                    spellCheck="false"
                    autoFocus
                  />
                </Field>
              )}
            />
            <Controller
              name="prompt"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Prompt</FieldLabel>
                  <Textarea
                    {...field}
                    id={field.name}
                    placeholder="Summarize the selected text in 3 bullet points"
                    autoComplete="off"
                    spellCheck="false"
                  />
                </Field>
              )}
            />
          </FieldGroup>
        </FieldSet>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit">Add</Button>
        </div>
      </form>
    </div>
  )
}
