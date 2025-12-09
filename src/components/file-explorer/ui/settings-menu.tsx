import { SettingsIcon } from 'lucide-react'
import { useUIStore } from '@/store/ui-store'
import { Button } from '@/ui/button'
import { getModifierKey } from '@/utils/keyboard-shortcut'

export function SettingsMenu() {
  const setSettingsDialogOpen = useUIStore((s) => s.setSettingsDialogOpen)

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-foreground/80 justify-start group hover:bg-background/40"
      onClick={() => setSettingsDialogOpen(true)}
    >
      <SettingsIcon /> Settings
      <span className="ml-auto text-sm text-muted-foreground transition-opacity group-hover:opacity-100 opacity-0">
        {getModifierKey()}
        <span className="ml-1">{';'}</span>
      </span>
    </Button>
  )
}
