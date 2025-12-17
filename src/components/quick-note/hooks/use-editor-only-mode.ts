import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import { useTabStore } from '@/store/tab-store'

export function useEditorOnlyMode() {
  const hydrateFromOpenedFiles = useTabStore(
    (state) => state.hydrateFromOpenedFiles
  )
  const [hasCheckedOpenedFiles, setHasCheckedOpenedFiles] = useState(false)

  useEffect(() => {
    let isMounted = true

    const bootstrap = async () => {
      try {
        const openedFiles = await invoke<string[]>('get_opened_files')

        if (!isMounted) {
          return
        }

        if (openedFiles.length > 0) {
          await hydrateFromOpenedFiles(openedFiles)
        }
      } catch (error) {
        console.error('Failed to load opened files:', error)
      } finally {
        if (isMounted) {
          setHasCheckedOpenedFiles(true)
        }
      }
    }

    bootstrap()

    return () => {
      isMounted = false
    }
  }, [hydrateFromOpenedFiles])

  return { hasCheckedOpenedFiles }
}
