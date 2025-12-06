import { relaunch } from '@tauri-apps/plugin-process'
import {
  check,
  type DownloadEvent,
  type Update,
} from '@tauri-apps/plugin-updater'
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'

export function Updater() {
  const isDev = import.meta.env.DEV
  const dismissedRef = useRef(false)

  const downloadAndInstall = useCallback(async (update: Update) => {
    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        switch (event.event) {
          case 'Started':
          case 'Progress':
          case 'Finished':
            break
          default:
            break
        }
      })

      toast.success('New version available', {
        position: 'bottom-left',
        action: {
          label: 'Update now',
          onClick: () => relaunch(),
        },
        cancel: {
          label: 'Later',
          onClick: () => {
            dismissedRef.current = true
          },
        },
        duration: 10_000,
        actionButtonStyle: { marginLeft: '0px' },
        cancelButtonStyle: { backgroundColor: 'transparent' },
      })
    } catch (err) {
      console.error('Failed to download and install update:', err)
    }
  }, [])

  const checkForUpdates = useCallback(async () => {
    if (isDev) return

    try {
      const update = await check()

      if (update) {
        downloadAndInstall(update)
      }
    } catch (err) {
      console.error('Failed to check for updates:', err)
    }
  }, [downloadAndInstall])

  useEffect(() => {
    // Check immediately on mount
    checkForUpdates()

    // Then check every 1 minute (only if not dismissed)
    const intervalId = setInterval(() => {
      if (dismissedRef.current) {
        clearInterval(intervalId)
        return
      }
      checkForUpdates()
    }, 60_000)

    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId)
    }
  }, [checkForUpdates])

  return null
}
