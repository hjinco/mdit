import { useEffect } from 'react'
import { useMediaQuery } from 'usehooks-ts'
import { useStore } from '@/store'
import { useUIStore } from '@/store/ui-store'

export function useAutoCloseSidebars() {
  const setFileExplorerOpen = useUIStore((state) => state.setFileExplorerOpen)
  const setCurrentCollectionPath = useStore(
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
