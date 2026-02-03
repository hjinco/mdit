import { AIChatPlugin } from "@platejs/ai/react"
import { PauseIcon } from "lucide-react"
import { useEditorPlugin, useHotkeys, usePluginOption } from "platejs/react"
import { cn } from "@/lib/utils"
import { Button } from "@/ui/button"

export function AILoadingBar() {
	const toolName = usePluginOption(AIChatPlugin, "toolName")
	const chat = usePluginOption(AIChatPlugin, "chat")
	const mode = usePluginOption(AIChatPlugin, "mode")
	const { status } = chat
	const { api } = useEditorPlugin(AIChatPlugin)
	const isLoading = status === "streaming" || status === "submitted"

	useHotkeys("esc", () => {
		api.aiChat.stop()
	})

	if (
		isLoading &&
		(mode === "insert" ||
			toolName === "comment" ||
			(toolName === "edit" && mode === "chat"))
	) {
		return (
			<div
				className={cn(
					"absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground shadow-md transition-all duration-300",
				)}
			>
				<span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
				<span>{status === "submitted" ? "Thinking..." : "Writing..."}</span>
				<Button
					size="sm"
					variant="ghost"
					className="flex items-center gap-1 text-xs"
					onClick={() => api.aiChat.stop()}
				>
					<PauseIcon />
					Stop
					<kbd className="ml-1 rounded bg-border px-1 font-mono text-[10px] text-muted-foreground shadow-sm">
						Esc
					</kbd>
				</Button>
			</div>
		)
	}

	return null
}
