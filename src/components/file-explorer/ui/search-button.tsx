import { SearchIcon } from 'lucide-react'
import { useUIStore } from '@/store/ui-store'
import { Button } from '@/ui/button'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

export function SearchButton() {
  const openCommandMenu = useUIStore((s) => s.openCommandMenu)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-foreground/70"
          onClick={openCommandMenu}
        >
          <SearchIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex items-center gap-1">
          Search
          <KbdGroup>
            <Kbd>Cmd</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
