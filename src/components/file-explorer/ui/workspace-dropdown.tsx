import { ChevronDown, InboxIcon } from 'lucide-react'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

type WorkspaceDropdownProps = {
  workspacePath: string | null
  recentWorkspacePaths: string[]
  onWorkspaceSelect: (path: string) => void
  onOpenFolderPicker: () => void
}

export function WorkspaceDropdown({
  workspacePath,
  recentWorkspacePaths,
  onWorkspaceSelect,
  onOpenFolderPicker,
}: WorkspaceDropdownProps) {
  const getLastFolderName = (path: string) => {
    return path.split('/').pop() || path
  }

  const currentWorkspaceName = workspacePath
    ? getLastFolderName(workspacePath)
    : 'No folder'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-start hover:bg-neutral-200/80 dark:hover:bg-neutral-700/80 text-foreground/90"
        >
          <InboxIcon />
          <span className="truncate">{currentWorkspaceName}</span>
          <ChevronDown className="ml-auto" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {recentWorkspacePaths.length > 0 ? (
          <>
            {recentWorkspacePaths.map((path) => (
              <Tooltip key={path} delayDuration={200}>
                <TooltipTrigger asChild>
                  <DropdownMenuItem onClick={() => onWorkspaceSelect(path)}>
                    <span className="text-sm text-accent-foreground/80 truncate max-w-full">
                      {getLastFolderName(path)}
                    </span>
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{path}</p>
                </TooltipContent>
              </Tooltip>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onClick={onOpenFolderPicker}>
          <span className="text-sm text-accent-foreground/80">
            Open Folder...
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
