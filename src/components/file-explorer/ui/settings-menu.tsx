import { SettingsIcon } from 'lucide-react'
import { useUIStore } from '@/store/ui-store'
import { Button } from '@/ui/button'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

export function SettingsMenu() {
  const setSettingsDialogOpen = useUIStore((s) => s.setSettingsDialogOpen)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-foreground/70 justify-start"
          onClick={() => setSettingsDialogOpen(true)}
        >
          <SettingsIcon /> Settings
        </Button>
      </TooltipTrigger>
      <TooltipContent className="px-1">
        <KbdGroup>
          <Kbd>Cmd</Kbd>
          <Kbd>,</Kbd>
        </KbdGroup>
      </TooltipContent>
    </Tooltip>
  )
}
