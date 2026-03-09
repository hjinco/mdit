import { cn } from "@mdit/ui/lib/utils"
import { FileText, ImageIcon } from "lucide-react"
import type { TImageElement } from "platejs"
import { useEditorRef, useElement } from "platejs/react"
import {
	buildImageModeUpdate,
	isImageModeToggleDisabled,
} from "./media-image-mode-utils"
import { MediaOverlayButton } from "./media-overlay-button"
import type { MediaImageWorkspaceState } from "./node-media-image"

type ImageElementWithEmbed = TImageElement & {
	embedTarget?: string
	height?: number
}

export function MediaImageModeSwitch({
	workspaceState,
	className,
}: {
	workspaceState: MediaImageWorkspaceState
	className?: string
}) {
	const editor = useEditorRef()
	const element = useElement() as ImageElementWithEmbed
	const checked = Boolean(element.embedTarget)
	const disabled = isImageModeToggleDisabled(element)

	const handleCheckedChange = (nextChecked: boolean) => {
		const path = editor.api.findPath(element)
		if (!path) return

		const nextNode = buildImageModeUpdate({
			element,
			mode: nextChecked ? "embed" : "markdown",
			workspaceState,
		})

		if (!nextNode) return

		if (!nextChecked) {
			editor.tf.unsetNodes(["embedTarget"], { at: path })
		}

		editor.tf.setNodes(nextNode, { at: path })
		editor.tf.focus()
	}

	return (
		<MediaOverlayButton
			className={cn(
				checked && "bg-background text-foreground shadow-xs",
				className,
			)}
			disabled={disabled}
			aria-label={
				checked
					? "Convert image to markdown mode"
					: "Convert image to embed mode"
			}
			aria-pressed={checked}
			onMouseDown={(e) => {
				e.preventDefault()
			}}
			onClick={() => handleCheckedChange(!checked)}
		>
			{checked ? <ImageIcon /> : <FileText />}
		</MediaOverlayButton>
	)
}
