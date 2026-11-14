import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect } from "react"
import { toast } from "sonner"

const destroyWindow = (appWindow: ReturnType<typeof getCurrentWindow>) =>
	appWindow.destroy()

export function useSaveBeforeWindowClose(
	flushDocuments: () => Promise<boolean>,
	closeWindow = destroyWindow,
) {
	useEffect(() => {
		const appWindow = getCurrentWindow()
		let isClosing = false
		let isDisposed = false
		const listener = appWindow
			.onCloseRequested(async (event) => {
				event.preventDefault()
				if (isClosing || isDisposed) {
					return
				}

				isClosing = true
				try {
					const didSave = await flushDocuments()
					if (isDisposed) {
						return
					}
					if (didSave) {
						await closeWindow(appWindow)
					} else {
						toast.error("Finish saving open notes before closing this window.")
					}
				} catch (error) {
					if (!isDisposed) {
						toast.error("Failed to close the window.")
					}
					console.error("Failed to close window:", error)
				} finally {
					isClosing = false
				}
			})
			.catch((error) => {
				console.error("Failed to listen for window close requests:", error)
			})

		return () => {
			isDisposed = true
			void listener.then((unlisten) => unlisten?.())
		}
	}, [closeWindow, flushDocuments])
}
