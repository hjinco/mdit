import {
	check,
	type DownloadEvent,
	type Update,
} from "@tauri-apps/plugin-updater"
import { useCallback, useEffect } from "react"
import { useShallow } from "zustand/react/shallow"
import { useCurrentWindowLabel } from "@/hooks/use-current-window-label"
import { useStore } from "@/store"

export function Updater() {
	const isDev = import.meta.env.DEV
	const label = useCurrentWindowLabel()
	const isMainWindow = label === "main"
	const isMainRoute = window.location.pathname === "/"
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
				await update.downloadAndInstall((event: DownloadEvent) => {
					switch (event.event) {
						case "Started":
						case "Progress":
						case "Finished":
							break
						default:
							break
					}
				})
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
		if (!isMainWindow || !isMainRoute) return
		if (isUpdateReady || isUpdateDownloading) return

		try {
			const update = await check()

			if (update) {
				await downloadAndInstall(update)
			}
		} catch (err) {
			console.error("Failed to check for updates:", err)
		}
	}, [
		downloadAndInstall,
		isMainRoute,
		isMainWindow,
		isUpdateDownloading,
		isUpdateReady,
	])

	useEffect(() => {
		if (label === null) {
			return
		}

		const runCheckForUpdates = async () => {
			try {
				await checkForUpdates()
			} catch (err) {
				console.error("Unexpected updater failure:", err)
			}
		}

		// Check immediately on mount
		void runCheckForUpdates()

		// Then check every 5 minutes
		const intervalId = setInterval(() => {
			void runCheckForUpdates()
		}, 5 * 60_000)

		// Cleanup interval on unmount
		return () => {
			clearInterval(intervalId)
		}
	}, [checkForUpdates, label])

	return null
}
