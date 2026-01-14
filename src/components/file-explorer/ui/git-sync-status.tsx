import { RefreshCw, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { useGitSync } from '../hooks/use-git-sync'

type Props = {
  workspacePath: string | null
}

export function GitSyncStatus({ workspacePath }: Props) {
  const { isGitRepo, status, sync, error } = useGitSync(workspacePath)
  const openSettings = useStore((s) => s.openSettingsWithTab)

  if (!isGitRepo) {
    return null
  }

  const getStatusLabel = () => {
    switch (status) {
      case 'synced':
        return 'synced'
      case 'unsynced':
        return 'unsynced'
      case 'syncing':
        return 'syncing'
      case 'error':
        return 'error'
      default:
        return 'error'
    }
  }

  const getDotColor = () => {
    switch (status) {
      case 'synced':
        return 'bg-green-500'
      case 'unsynced':
        return 'bg-yellow-500'
      case 'syncing':
        return 'bg-blue-500'
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-red-500'
    }
  }

  const shouldPulse = status === 'syncing'

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="relative shrink-0 h-6 w-6 rounded-full p-0 hover:bg-background/40"
              disabled={status === 'syncing'}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  getDotColor(),
                  shouldPulse && 'animate-pulse'
                )}
              />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        {error && (
          <TooltipContent side="right" align="start" className="max-w-48">
            <p className="select-text">{error}</p>
          </TooltipContent>
        )}
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex items-center gap-3 pl-3 cursor-default">
          <span
            className={cn(
              'size-1.5 rounded-full',
              getDotColor(),
              shouldPulse && 'animate-pulse'
            )}
          />
          {getStatusLabel()}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={sync} disabled={status === 'syncing'}>
          <RefreshCw className="size-3.5" />
          {status === 'error' ? 'Retry' : 'Git Sync'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openSettings('sync')}>
          <Settings className="size-3.5" />
          Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
