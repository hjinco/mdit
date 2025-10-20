export type DefaultSelectionCommandTemplate = {
  value: string
  label: string
  prompt: string
}

export const DEFAULT_SELECTION_COMMAND_TEMPLATES: DefaultSelectionCommandTemplate[] =
  [
    {
      value: 'improveWriting',
      label: 'Improve writing',
      prompt: 'Improve the writing',
    },
    {
      value: 'fixSpelling',
      label: 'Fix spelling & grammar',
      prompt: 'Fix spelling and grammar',
    },
    {
      value: 'makeLonger',
      label: 'Make longer',
      prompt: 'Make longer',
    },
    {
      value: 'makeShorter',
      label: 'Make shorter',
      prompt: 'Make shorter',
    },
    {
      value: 'simplifyLanguage',
      label: 'Simplify language',
      prompt: 'Simplify the language',
    },
  ]

export const DEFAULT_SELECTION_COMMAND_TEMPLATE_MAP =
  DEFAULT_SELECTION_COMMAND_TEMPLATES.reduce<
    Record<string, DefaultSelectionCommandTemplate>
  >((acc, template) => {
    acc[template.value] = template
    return acc
  }, {})
