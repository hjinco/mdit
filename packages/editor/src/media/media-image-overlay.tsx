import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@mdit/ui/components/tooltip"
import { cn } from "@mdit/ui/lib/utils"
import { useCaptionButton, useCaptionButtonState } from "@platejs/caption/react"
import { Trash2Icon, TypeIcon } from "lucide-react"
import type { ComponentProps, MouseEventHandler } from "react"
import { MediaImageModeSwitch } from "./media-image-mode-switch"
import { MediaOverlayButton } from "./media-overlay-button"
import type { MediaImageWorkspaceState } from "./node-media-image"

type MediaImageOverlayProps = {
	isEmbedImage: boolean
	overlayVisible: boolean
	workspaceState: MediaImageWorkspaceState
	onDeleteMouseDown?: MouseEventHandler<HTMLButtonElement>
	deleteButtonProps?: Omit<
		ComponentProps<typeof MediaOverlayButton>,
		"children" | "className" | "onMouseDown" | "type"
	>
}

function MediaImageCaptionButton({ isEmbedImage }: { isEmbedImage: boolean }) {
	const state = useCaptionButtonState()
	const captionButton = useCaptionButton(state)

	return (
		<MediaOverlayButton
			disabled={isEmbedImage}
			aria-label="Caption"
			{...captionButton.props}
		>
			<TypeIcon />
		</MediaOverlayButton>
	)
}

export function MediaImageOverlay({
	deleteButtonProps,
	isEmbedImage,
	onDeleteMouseDown,
	overlayVisible,
	workspaceState,
}: MediaImageOverlayProps) {
	return (
		<TooltipProvider delayDuration={150}>
			<div
				className={cn(
					"pointer-events-none absolute top-1 right-1 z-50 flex items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm backdrop-blur-sm transition-opacity",
					"group-hover/media:pointer-events-auto group-hover/media:opacity-100",
					overlayVisible ? "pointer-events-auto opacity-100" : "opacity-0",
				)}
			>
				<Tooltip>
					<TooltipTrigger asChild>
						<div>
							<MediaImageModeSwitch workspaceState={workspaceState} />
						</div>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={8}>
						{isEmbedImage
							? "Convert to markdown image"
							: "Convert to embedded image"}
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<div>
							<MediaImageCaptionButton isEmbedImage={isEmbedImage} />
						</div>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={8}>
						{isEmbedImage
							? "Captions are unavailable in embed mode"
							: "Caption"}
					</TooltipContent>
				</Tooltip>

				<div className="mx-0.5 h-3.5 w-px bg-border" />

				<MediaOverlayButton
					aria-label="Delete image"
					onMouseDown={(e) => {
						e.preventDefault()
						onDeleteMouseDown?.(e)
					}}
					{...deleteButtonProps}
				>
					<Trash2Icon />
				</MediaOverlayButton>
			</div>
		</TooltipProvider>
	)
}
