import { check, type Update } from "@tauri-apps/plugin-updater"
import { useCallback, useEffect } from "react"
import { useShallow } from "zustand/react/shallow"
import { useCurrentWindowLabel } from "@/hooks/use-current-window-label"
import { useStore } from "@/store"

export function Updater() {
	const isDev = import.meta.env.DEV
	const label = useCurrentWindowLabel()
	const isMainWindow = label === "main"
	const {
		isUpdateReady,
		isUpdateDownloading,
		setUpdateReady,
		setUpdateDownloading,
	} = useStore(
		useShallow((state) => ({
			isUpdateReady: state.isUpdateReady,
			isUpdateDownloading: state.isUpdateDownloading,
			setUpdateReady: state.setUpdateReady,
			setUpdateDownloading: state.setUpdateDownloading,
		})),
	)

	const downloadAndInstall = useCallback(
		async (update: Update) => {
			try {
				setUpdateDownloading(true)
				await update.downloadAndInstall()
				setUpdateReady(true)
			} catch (err) {
				console.error("Failed to download and install update:", err)
			} finally {
				setUpdateDownloading(false)
			}
		},
		[setUpdateDownloading, setUpdateReady],
	)

	const checkForUpdates = useCallback(async () => {
		if (isDev) return
		if (!isMainWindow) return
		if (isUpdateReady || isUpdateDownloading) return

		try {
			const update = await check()

			if (update) {
				await downloadAndInstall(update)
			}
		} catch (err) {
			console.error("Failed to check for updates:", err)
		}
	}, [downloadAndInstall, isMainWindow, isUpdateDownloading, isUpdateReady])

	useEffect(() => {
		if (label === null) {
			return
		}

		// Check immediately on mount
		void checkForUpdates()

		// Then check every 5 minutes
		const intervalId = setInterval(() => {
			void checkForUpdates()
		}, 5 * 60_000)

		// Cleanup interval on unmount
		return () => {
			clearInterval(intervalId)
		}
	}, [checkForUpdates, label])

	return null
}
