import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/contexts/theme-context'
import { useMDXSettingsStore } from '@/store/mdx-settings-store'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'
import { Switch } from '@/ui/switch'

export function PreferencesTab() {
  const { theme, setTheme } = useTheme()
  const { isMDXEnabled, setMDXEnabled } = useMDXSettingsStore()

  const themeOptions: Array<{
    value: 'light' | 'dark' | 'system'
    label: string
    icon?: React.ReactNode
  }> = [
    { value: 'light', label: 'Light', icon: <Sun /> },
    { value: 'dark', label: 'Dark', icon: <Moon /> },
    { value: 'system', label: 'System', icon: <Monitor /> },
  ]

  return (
    <div className="flex-1 overflow-y-auto p-12">
      <FieldSet>
        <FieldLegend>Preferences</FieldLegend>
        <FieldDescription>Customize your Mdit experience</FieldDescription>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Appearance</FieldLabel>
              <FieldDescription>
                Choose how you want Mdit to look
              </FieldDescription>
            </FieldContent>
            <Select
              value={theme}
              onValueChange={(value) =>
                setTheme(value as 'light' | 'dark' | 'system')
              }
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {themeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.icon}
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>MDX Mode</FieldLabel>
              <FieldDescription>
                Enable JSX blocks like callouts and table of contents. Add them
                using slash commands.
              </FieldDescription>
            </FieldContent>
            <Switch checked={isMDXEnabled} onCheckedChange={setMDXEnabled} />
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  )
}
