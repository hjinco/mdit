import type { getCurrentWindow } from "@tauri-apps/api/window"
import { useDesktopRuntime, useWorkspaceState } from "@/state"
import { ChatPanel } from "./components/chat/chat-panel"
import { CollectionView } from "./components/collection-view/collection-view"
import { CommandMenu } from "./components/command-menu/command-menu"
import { Editor } from "./components/editor/editor"
import { FileExplorer } from "./components/file-explorer/file-explorer"
import { ImageEditDialog } from "./components/image/image-edit-dialog"
import { ImagePreviewDialog } from "./components/image/image-preview-dialog"
import { SettingsDialog } from "./components/settings"
import { Welcome } from "./components/welcome/welcome"
import { ScreenCaptureProvider } from "./contexts/screen-capture-context"
import { useFontScale } from "./hooks/use-font-scale"
import { useSaveBeforeWindowClose } from "./hooks/use-save-before-window-close"
import { isLinux, isWindows10 } from "./utils/platform"

async function hideMainWindow(appWindow: ReturnType<typeof getCurrentWindow>) {
	if (await appWindow.isFullscreen()) {
		await appWindow.setFullscreen(false)
		await new Promise((resolve) => setTimeout(resolve, 700))
	}
	await appWindow.hide()
}

export function App() {
	const workspacePath = useWorkspaceState((state) => state.workspacePath)
	const isLoading = useWorkspaceState((state) => state.isLoading)
	const { flushAllDocuments } = useDesktopRuntime().documents.commands
	useFontScale()
	useSaveBeforeWindowClose(flushAllDocuments, hideMainWindow)

	const mutedBgClass = isLinux() || isWindows10() ? "bg-muted" : "bg-muted/70"

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
					<ChatPanel />
				</div>
			</div>
			<SettingsDialog />
			<CommandMenu />
			<ImagePreviewDialog />
			<ImageEditDialog />
		</ScreenCaptureProvider>
	)
}
