import { Button } from "@mdit/ui/components/button"
import { cn } from "@mdit/ui/lib/utils"
import { IconPinned, IconPinnedFilled } from "@tabler/icons-react"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useCallback, useEffect, useState } from "react"

export function WindowPinButton({ className }: { className?: string }) {
	const [isPinned, setIsPinned] = useState(false)
	const [isPending, setIsPending] = useState(false)
	const syncTrafficLights = useCallback(async (hidden: boolean) => {
		try {
			await invoke("set_macos_traffic_lights_hidden", { hidden })
		} catch (error) {
			console.error("Failed to sync macOS traffic light visibility:", error)
		}
	}, [])

	useEffect(() => {
		let isMounted = true
		const appWindow = getCurrentWindow()

		appWindow
			.isAlwaysOnTop()
			.then(async (alwaysOnTop) => {
				if (isMounted) {
					setIsPinned(alwaysOnTop)
				}
				await syncTrafficLights(alwaysOnTop)
			})
			.catch((error) => {
				console.error("Failed to read window pin state:", error)
			})

		return () => {
			isMounted = false
		}
	}, [syncTrafficLights])

	const handleToggle = useCallback(async () => {
		if (isPending) {
			return
		}

		const nextPinned = !isPinned
		const appWindow = getCurrentWindow()
		setIsPending(true)

		try {
			await appWindow.setAlwaysOnTop(nextPinned)
			setIsPinned(nextPinned)
			await syncTrafficLights(nextPinned)
		} catch (error) {
			console.error("Failed to toggle window pin state:", error)
		} finally {
			setIsPending(false)
		}
	}, [isPinned, isPending, syncTrafficLights])

	const label = isPinned ? "Unpin window" : "Pin window"

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			className={cn("text-foreground/70", className)}
			aria-label={label}
			title={label}
			disabled={isPending}
			onClick={() => {
				void handleToggle()
			}}
		>
			{isPinned ? <IconPinnedFilled /> : <IconPinned />}
		</Button>
	)
}
