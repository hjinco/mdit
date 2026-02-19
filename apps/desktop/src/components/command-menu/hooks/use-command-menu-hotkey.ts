import { useCallback, useEffect } from "react"

// Registers ⌘/Ctrl + K to toggle the command menu.
export const useCommandMenuHotkey = (
	isOpen: boolean,
	openMenu: () => void,
	closeMenu: () => void,
) => {
	const toggleMenu = useCallback(() => {
		if (isOpen) {
			closeMenu()
		} else {
			openMenu()
		}
	}, [closeMenu, isOpen, openMenu])

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) {
				return
			}

			const usesShortcutKey = event.metaKey || event.ctrlKey
			if (!usesShortcutKey || event.key.toLowerCase() !== "k") {
				return
			}

			event.preventDefault()
			toggleMenu()
		}

		window.addEventListener("keydown", handleKeyDown, true)
		return () => window.removeEventListener("keydown", handleKeyDown, true)
	}, [toggleMenu])
}
