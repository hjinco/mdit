import { Switch } from "@mdit/ui/components/switch"
import type { TImageElement } from "platejs"
import { useEditorRef, useElement } from "platejs/react"
import {
	buildImageModeUpdate,
	isImageModeToggleDisabled,
} from "./media-image-mode-utils"
import type { MediaImageWorkspaceState } from "./node-media-image"

type ImageElementWithEmbed = TImageElement & {
	embedTarget?: string
	height?: number
}

export function MediaImageModeSwitch({
	workspaceState,
}: {
	workspaceState: MediaImageWorkspaceState
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
		<div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
			<span>Markdown</span>
			<Switch
				checked={checked}
				disabled={disabled}
				onCheckedChange={handleCheckedChange}
				aria-label="Toggle image embed mode"
			/>
			<span>Embed</span>
		</div>
	)
}
