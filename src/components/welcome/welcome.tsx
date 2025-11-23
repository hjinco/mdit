import { FolderOpenIcon } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import { isMac } from '@/utils/platform'

export function Welcome() {
  const { openFolderPicker } = useWorkspaceStore()

  return (
    <div className="w-full h-screen flex flex-col bg-muted/70">
      <div
        className="w-full h-10"
        {...(isMac() && { 'data-tauri-drag-region': '' })}
      />
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="max-w-sm w-full">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Welcome</h1>
            <p className="text-muted-foreground leading-relaxed">
              Organize notes in your folder.
            </p>
          </div>

          <div className="flex flex-col items-center mt-8">
            <Button
              variant="secondary"
              size="lg"
              className="w-fit"
              onClick={openFolderPicker}
            >
              <FolderOpenIcon />
              Open Folder
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
