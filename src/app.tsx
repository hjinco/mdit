import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect } from "react"
import { useShallow } from "zustand/shallow"
import { CollectionView } from "./components/collection-view/collection-view"
import { CommandMenu } from "./components/command-menu/command-menu"
import { Editor } from "./components/editor/editor"
import { FileExplorer } from "./components/file-explorer/file-explorer"
import { ImageEditDialog } from "./components/image/image-edit-dialog"
import { ImagePreviewDialog } from "./components/image/image-preview-dialog"
import { LicenseKeyButton } from "./components/license/license-key-button"
import { SettingsDialog } from "./components/settings/settings"
import { Welcome } from "./components/welcome/welcome"
import { ScreenCaptureProvider } from "./contexts/screen-capture-context"
import { useAutoIndexing } from "./hooks/use-auto-indexing"
import { useFontScale } from "./hooks/use-font-scale"
import { useStore } from "./store"
import { isLinux, isWindows10 } from "./utils/platform"

export function App() {
	const {
		workspacePath,
		isLoading,
		initializeWorkspace,
		watchWorkspace,
		unwatchWorkspace,
	} = useStore(
		useShallow((s) => ({
			workspacePath: s.workspacePath,
			isLoading: s.isLoading,
			initializeWorkspace: s.initializeWorkspace,
			watchWorkspace: s.watchWorkspace,
			unwatchWorkspace: s.unwatchWorkspace,
		})),
	)
	useFontScale()
	useAutoIndexing(workspacePath)

	const mutedBgClass = isWindows10() || isLinux() ? "bg-muted" : "bg-muted/70"

	useEffect(() => {
		const appWindow = getCurrentWindow()
		const closeListener = appWindow.listen(
			"tauri://close-requested",
			async () => {
				const isFullscreen = await appWindow.isFullscreen()
				if (isFullscreen) {
					await appWindow.setFullscreen(false)
					await new Promise((resolve) => setTimeout(resolve, 700))
				}
				appWindow.hide()
			},
		)

		return () => {
			closeListener.then((unlisten) => unlisten())
		}
	}, [])

	useEffect(() => {
		if (!workspacePath) {
			unwatchWorkspace()
			return
		}

		watchWorkspace()

		return () => {
			unwatchWorkspace()
		}
	}, [watchWorkspace, unwatchWorkspace, workspacePath])

	useEffect(() => {
		initializeWorkspace()
	}, [initializeWorkspace])

	if (isLoading) {
		return <div className={`h-screen ${mutedBgClass}`} />
	}

	if (!workspacePath) {
		return (
			<div className={mutedBgClass}>
				<Welcome />
			</div>
		)
	}

	return (
		<ScreenCaptureProvider>
			<div className={`h-screen flex flex-col ${mutedBgClass}`}>
				<div className="flex-1 overflow-hidden flex">
					<div className="group/side flex">
						<FileExplorer />
						<CollectionView />
					</div>
					<Editor />
					<div className="fixed bottom-1 right-1">
						<LicenseKeyButton />
					</div>
				</div>
			</div>
			<SettingsDialog />
			<CommandMenu />
			<ImagePreviewDialog />
			<ImageEditDialog />
		</ScreenCaptureProvider>
	)
}
