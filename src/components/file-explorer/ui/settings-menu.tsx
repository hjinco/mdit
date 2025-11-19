import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { SettingsIcon } from 'lucide-react'
import { useUIStore } from '@/store/ui-store'
import { Button } from '@/ui/button'
import { TooltipContent, TooltipTrigger } from '@/ui/tooltip'

export function SettingsMenu() {
  const setSettingsDialogOpen = useUIStore((s) => s.setSettingsDialogOpen)

  return (
    <TooltipPrimitive.Root data-slot="tooltip">
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
      <TooltipContent>Settings</TooltipContent>
    </TooltipPrimitive.Root>
  )
}
