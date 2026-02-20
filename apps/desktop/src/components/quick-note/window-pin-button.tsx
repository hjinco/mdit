import { Button } from "@mdit/ui/components/button"
import { cn } from "@mdit/ui/lib/utils"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { PinIcon, PinOffIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

export function WindowPinButton({ className }: { className?: string }) {
	const [isPinned, setIsPinned] = useState(false)
	const [isPending, setIsPending] = useState(false)

	useEffect(() => {
		let isMounted = true
		const appWindow = getCurrentWindow()

		appWindow
			.isAlwaysOnTop()
			.then((alwaysOnTop) => {
				if (isMounted) {
					setIsPinned(alwaysOnTop)
				}
			})
			.catch((error) => {
				console.error("Failed to read window pin state:", error)
			})

		return () => {
			isMounted = false
		}
	}, [])

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
		} catch (error) {
			console.error("Failed to toggle window pin state:", error)
		} finally {
			setIsPending(false)
		}
	}, [isPinned, isPending])

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
			{isPinned ? <PinOffIcon /> : <PinIcon />}
		</Button>
	)
}
