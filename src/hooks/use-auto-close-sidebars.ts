import { useEffect } from 'react'
import { useMediaQuery } from 'usehooks-ts'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'

export function useAutoCloseSidebars() {
  const setFileExplorerOpen = useUIStore((state) => state.setFileExplorerOpen)
  const setCurrentCollectionPath = useWorkspaceStore(
    (state) => state.setCurrentCollectionPath
  )
  const matches = useMediaQuery('(max-width: 640px)')

  useEffect(() => {
    if (matches) {
      setFileExplorerOpen(false)
      setCurrentCollectionPath(null)
    }
  }, [matches, setFileExplorerOpen, setCurrentCollectionPath])
}
