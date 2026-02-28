import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect } from "react"
import { useShallow } from "zustand/shallow"
import { CollectionView } from "./components/collection-view/collection-view"
import { CommandMenu } from "./components/command-menu/command-menu"
import { Editor } from "./components/editor/editor"
import { FileExplorer } from "./components/file-explorer/file-explorer"
import { GraphViewDialog } from "./components/graph-view/graph-view-dialog"
import { ImageEditDialog } from "./components/image/image-edit-dialog"
import { ImagePreviewDialog } from "./components/image/image-preview-dialog"
import { LicenseKeyButton } from "./components/license/license-key-button"
import { SettingsDialog } from "./components/settings/settings"
import { Welcome } from "./components/welcome/welcome"
import { ScreenCaptureProvider } from "./contexts/screen-capture-context"
import { useAutoIndexing } from "./hooks/use-auto-indexing"
import { useFontScale } from "./hooks/use-font-scale"
import { useGitSync } from "./hooks/use-git-sync"
import { startLocalApiServer, stopLocalApiServer } from "./lib/local-api"
import { useStore } from "./store"
import { checkInternetConnectivity } from "./utils/network-utils"
import { isLinux, isWindows10 } from "./utils/platform"

export function App() {
	const {
		workspacePath,
		isLoading,
		initializeWorkspace,
		initializeAISettings,
		initializeHotkeys,
		checkLicense,
		watchWorkspace,
		unwatchWorkspace,
		licenseStatus,
		hasVerifiedLicense,
		localApiEnabled,
		setLocalApiEnabled,
		setLocalApiError,
	} = useStore(
		useShallow((s) => ({
			workspacePath: s.workspacePath,
			isLoading: s.isLoading,
			initializeWorkspace: s.initializeWorkspace,
			initializeAISettings: s.initializeAISettings,
			initializeHotkeys: s.initializeHotkeys,
			checkLicense: s.checkLicense,
			watchWorkspace: s.watchWorkspace,
			unwatchWorkspace: s.unwatchWorkspace,
			licenseStatus: s.status,
			hasVerifiedLicense: s.hasVerifiedLicense,
			localApiEnabled: s.localApiEnabled,
			setLocalApiEnabled: s.setLocalApiEnabled,
			setLocalApiError: s.setLocalApiError,
		})),
	)
	useFontScale()
	useAutoIndexing(workspacePath)
	useGitSync(workspacePath)

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

	useEffect(() => {
		void initializeAISettings()
	}, [initializeAISettings])

	useEffect(() => {
		void initializeHotkeys()
	}, [initializeHotkeys])

	useEffect(() => {
		const checkAndValidateLicense = async () => {
			const polarApiBaseUrl = import.meta.env.VITE_POLAR_API_BASE_URL
			const organizationId = import.meta.env.VITE_POLAR_ORGANIZATION_ID
			if (!polarApiBaseUrl || !organizationId) {
				await checkLicense()
				return
			}

			const isOnline = await checkInternetConnectivity()
			if (!isOnline) {
				return
			}

			await checkLicense()
		}

		void checkAndValidateLicense()
		window.addEventListener("online", checkAndValidateLicense)

		return () => {
			window.removeEventListener("online", checkAndValidateLicense)
		}
	}, [checkLicense])

	useEffect(() => {
		const syncLocalApiServerState = async () => {
			if (licenseStatus === "invalid" && localApiEnabled) {
				setLocalApiEnabled(false)
			}

			const shouldRunLocalApi =
				localApiEnabled && licenseStatus === "valid" && hasVerifiedLicense

			try {
				if (shouldRunLocalApi) {
					await startLocalApiServer()
				} else {
					await stopLocalApiServer()
				}
				setLocalApiError(null)
			} catch (error) {
				const action = shouldRunLocalApi ? "start" : "stop"
				const message =
					error instanceof Error ? error.message : String(error ?? "Unknown")
				setLocalApiError(`Failed to ${action} local API server: ${message}`)
			}
		}

		void syncLocalApiServerState()
	}, [
		localApiEnabled,
		licenseStatus,
		hasVerifiedLicense,
		setLocalApiEnabled,
		setLocalApiError,
	])

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
			<GraphViewDialog />
			<ImagePreviewDialog />
			<ImageEditDialog />
		</ScreenCaptureProvider>
	)
}
