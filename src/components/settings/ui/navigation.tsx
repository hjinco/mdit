import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'
import { DialogTitle } from '@/ui/dialog'

export type SettingsTab = 'preferences' | 'ai'

interface SettingsNavigationProps {
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}

export function SettingsNavigation({
  activeTab,
  onTabChange,
}: SettingsNavigationProps) {
  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'preferences', label: 'Preferences' },
    { id: 'ai', label: 'AI' },
  ]

  return (
    <nav className="flex flex-col p-1 gap-1 border-r w-40 bg-muted">
      <DialogTitle className="text-sm p-3 font-medium">Settings</DialogTitle>
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          variant="ghost"
          size="sm"
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'justify-start cursor-pointer',
            activeTab === tab.id
              ? 'bg-foreground/10 hover:bg-foreground/10 dark:hover:bg-foreground/10'
              : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
          )}
        >
          {tab.label}
        </Button>
      ))}
    </nav>
  )
}
