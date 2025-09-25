import { FolderOpenIcon } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Button } from '@/ui/button'

export function Welcome() {
  const { openFolderPicker } = useWorkspaceStore()

  return (
    <div className="w-full flex flex-col items-center justify-center">
      <div className="max-w-sm w-full">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Welcome</h1>
          <p className="text-muted-foreground leading-relaxed">
            Organize your notes in your workspace folder.
          </p>
        </div>

        <div className="flex flex-col gap-2 mt-8">
          <Button variant="outline" onClick={openFolderPicker}>
            <FolderOpenIcon />
            Open Folder
          </Button>
        </div>
      </div>
    </div>
  )
}
