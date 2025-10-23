import { SettingsIcon } from 'lucide-react'
import { useUIStore } from '@/store/ui-store'
import { Button } from '@/ui/button'

export function SettingsMenu() {
  const setSettingsDialogOpen = useUIStore((s) => s.setSettingsDialogOpen)

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-start text-muted-foreground hover:bg-stone-200/80 dark:hover:bg-stone-700/80"
      onClick={() => setSettingsDialogOpen(true)}
    >
      <SettingsIcon /> Settings
    </Button>
  )
}
