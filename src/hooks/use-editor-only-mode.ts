import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import { useTabStore } from '@/store/tab-store'
import { useWorkspaceStore } from '@/store/workspace-store'

export function useEditorOnlyMode() {
  const initializeWorkspace = useWorkspaceStore((s) => s.initializeWorkspace)
  const workspacePath = useWorkspaceStore((s) => s.workspacePath)
  const hydrateFromOpenedFiles = useTabStore(
    (state) => state.hydrateFromOpenedFiles
  )
  const [isEditorOnlyMode, setIsEditorOnlyMode] = useState(false)
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
          const hydrated = await hydrateFromOpenedFiles(openedFiles)

          if (!isMounted) {
            return
          }

          if (hydrated) {
            setIsEditorOnlyMode(true)
            return
          }
        }

        await initializeWorkspace()
      } catch (error) {
        console.error('Failed to load opened files:', error)
        await initializeWorkspace()
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
  }, [hydrateFromOpenedFiles, initializeWorkspace])

  useEffect(() => {
    if (!workspacePath || !hasCheckedOpenedFiles || !isEditorOnlyMode) {
      return
    }

    setIsEditorOnlyMode(false)
  }, [workspacePath, hasCheckedOpenedFiles, isEditorOnlyMode])

  return { isEditorOnlyMode, hasCheckedOpenedFiles }
}
