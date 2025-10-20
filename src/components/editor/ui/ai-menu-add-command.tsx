import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'
import { Textarea } from '@/ui/textarea'
import type { Command } from '../hooks/use-ai-commands'
import { interceptPopoverHotkeys } from '../utils/intercept-popover-hotkeys'
import {
  DEFAULT_SELECTION_COMMAND_TEMPLATE_MAP,
  DEFAULT_SELECTION_COMMAND_TEMPLATES,
} from './ai-default-commands'

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
  const [template, setTemplate] = useState('custom')
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
    setTemplate('custom')
    onClose()
  }

  function handleCancel() {
    form.reset()
    setTemplate('custom')
    onClose()
  }

  const handleTemplateChange = (value: string) => {
    setTemplate(value)

    if (value === 'custom') return

    const template = DEFAULT_SELECTION_COMMAND_TEMPLATE_MAP[value]

    if (!template) return

    form.setValue('label', template.label, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
    form.setValue('prompt', template.prompt, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
  }

  return (
    <div className="w-full rounded-lg border shadow-xl bg-background p-4">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FieldSet>
          <FieldLegend>Add Command</FieldLegend>
          <FieldDescription>Add a new command to the AI menu.</FieldDescription>
          <FieldGroup>
            <Field>
              <FieldLabel>Template</FieldLabel>
              <Select value={template} onValueChange={handleTemplateChange}>
                <SelectTrigger className="w-full justify-between">
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom</SelectItem>
                  {DEFAULT_SELECTION_COMMAND_TEMPLATES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
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
                    onKeyDown={(event) => {
                      interceptPopoverHotkeys(event)
                    }}
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
                    onKeyDown={(event) => {
                      interceptPopoverHotkeys(event)
                    }}
                  />
                </Field>
              )}
            />
          </FieldGroup>
        </FieldSet>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Add
          </Button>
        </div>
      </form>
    </div>
  )
}
