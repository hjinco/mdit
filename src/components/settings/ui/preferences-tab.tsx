import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/contexts/theme-context'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'

export function PreferencesTab() {
  const { theme, setTheme } = useTheme()

  const themeOptions: Array<{
    value: 'light' | 'dark' | 'system'
    label: string
    icon?: React.ReactNode
  }> = [
    { value: 'light', label: 'Light', icon: <Sun className="size-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="size-4" /> },
    { value: 'system', label: 'System', icon: null },
  ]

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <FieldGroup>
        <Field orientation="vertical">
          <FieldLabel>Appearance</FieldLabel>
          <FieldDescription>Choose how you want Mdit to look</FieldDescription>
          <FieldContent>
            <Select
              value={theme}
              onValueChange={(value) =>
                setTheme(value as 'light' | 'dark' | 'system')
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {themeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      {option.icon}
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
      </FieldGroup>
    </div>
  )
}
