import { cn } from '@/lib/utils'
import { isMac } from '@/utils/platform'
import { SearchButton } from './search-button'
import { ToggleButton } from './toggle-button'

export function TopMenu({
  isOpen,
  width,
  isResizing,
  isFileExplorerOpen,
  setFileExplorerOpen,
}: {
  isOpen: boolean
  width: number
  isResizing: boolean
  isFileExplorerOpen: boolean
  setFileExplorerOpen: (isOpen: boolean) => void
}) {
  const isMacOS = isMac()
  const closedWidth = isMacOS ? 120 : 48

  return (
    <div
      className={cn(
        'fixed top-0 h-12 flex items-center justify-end gap-1 px-2 z-[9999]',
        !isResizing && 'transition-[width] ease-out duration-100'
      )}
      style={{ width: isOpen ? width : closedWidth }}
      data-tauri-drag-region
    >
      {isFileExplorerOpen && <SearchButton />}
      <ToggleButton
        isOpen={isFileExplorerOpen}
        onToggle={() => setFileExplorerOpen(!isFileExplorerOpen)}
      />
    </div>
  )
}
