import { relaunch } from "@tauri-apps/plugin-process"
import { ArrowDownToLineIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useStore } from "@/store"

export function UpdateButton() {
	const isUpdateReady = useStore((state) => state.isUpdateReady)

	if (!isUpdateReady) {
		return null
	}

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="text-foreground/80 justify-start group hover:bg-background/40 px-1.5!"
			onClick={() => relaunch()}
		>
			<ArrowDownToLineIcon className="size-4" /> Update now
		</Button>
	)
}
