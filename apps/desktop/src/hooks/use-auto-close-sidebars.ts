import { useEffect } from "react"
import { useMediaQuery } from "usehooks-ts"
import { useDesktopRuntime } from "@/state"

export function useAutoCloseSidebars() {
	const setFileExplorerOpen =
		useDesktopRuntime().window.commands.setFileExplorerOpen
	const setCurrentCollectionPath =
		useDesktopRuntime().workspace.commands.setCurrentCollectionPath
	const matches = useMediaQuery("(max-width: 640px)")

	useEffect(() => {
		if (matches) {
			setFileExplorerOpen(false)
			setCurrentCollectionPath(null)
		}
	}, [matches, setFileExplorerOpen, setCurrentCollectionPath])
}
