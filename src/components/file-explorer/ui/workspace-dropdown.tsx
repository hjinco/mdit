import { ChevronDown, InboxIcon } from 'lucide-react'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { getModifierKey } from '@/utils/keyboard-shortcut'
import { getFolderNameFromPath } from '@/utils/path-utils'

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
  const currentWorkspaceName = workspacePath
    ? getFolderNameFromPath(workspacePath)
    : 'No folder'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-foreground/90 tracking-tight min-w-0 flex-1 px-1.5! h-8 hover:bg-background/40"
        >
          <InboxIcon className="size-4" />
          <span className="flex-1 text-start text-sm text-overflow-mask">
            {currentWorkspaceName}
          </span>
          <ChevronDown className="ml-auto shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 bg-popover/90">
        {recentWorkspacePaths.length > 0 ? (
          <>
            {recentWorkspacePaths.map((path) => (
              <Tooltip key={path} delayDuration={200}>
                <TooltipTrigger asChild>
                  <DropdownMenuItem onClick={() => onWorkspaceSelect(path)}>
                    <span className="text-sm text-accent-foreground/90 truncate max-w-full">
                      {getFolderNameFromPath(path)}
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
          <span className="text-sm text-accent-foreground/90 mr-auto">
            Open Folder...
          </span>
          <KbdGroup>
            <Kbd>{getModifierKey()}</Kbd>
            <Kbd>O</Kbd>
          </KbdGroup>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
