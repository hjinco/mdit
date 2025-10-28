import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { openUrl } from '@tauri-apps/plugin-opener'
import { SendIcon } from 'lucide-react'
import { useCallback } from 'react'
import { Button } from '@/ui/button'
import { TooltipContent, TooltipTrigger } from '@/ui/tooltip'

export function FeedbackButton() {
  const handleFeatureBaseClick = useCallback(async () => {
    try {
      await openUrl('https://mdit.featurebase.app')
    } catch (error) {
      console.error('Failed to open FeatureBase URL:', error)
    }
  }, [])

  return (
    <TooltipPrimitive.Root data-slot="tooltip">
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:bg-stone-200/80 dark:hover:bg-stone-700/80"
          onClick={handleFeatureBaseClick}
        >
          <SendIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Feedback</TooltipContent>
    </TooltipPrimitive.Root>
  )
}
