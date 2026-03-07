import { cn } from "@mdit/ui/lib/utils"
import { Image, useMediaState } from "@platejs/media/react"
import { ResizableProvider, useResizableValue } from "@platejs/resizable"
import { ImageOff } from "lucide-react"
import { dirname, isAbsolute, resolve } from "pathe"
import type { NodeComponent, TImageElement } from "platejs"
import type { PlateElementProps } from "platejs/react"
import { PlateElement, withHOC } from "platejs/react"
import { useMemo, useState } from "react"
import { hasParentTraversal, WINDOWS_ABSOLUTE_REGEX } from "../link"
import { Caption, CaptionTextarea } from "../media/caption"
import { MediaImageModeSwitch } from "../media/media-image-mode-switch"
import type { ImageElementWithEmbed } from "../media/media-image-mode-utils"
import { MediaToolbar } from "../media/media-toolbar"
import {
	mediaResizeHandleVariants,
	Resizable,
	ResizeHandle,
} from "../shared/resize-handle"

export type MediaImageWorkspaceState = {
	tabPath: string | null
	workspacePath: string | null
}

export type MediaImageHostDeps = {
	useWorkspaceState: () => MediaImageWorkspaceState
	toFileUrl: (absolutePath: string) => string
}

function isSafeEmbedTarget(path: string): boolean {
	const normalized = path.trim()
	if (!normalized) return false
	if (normalized.startsWith("/")) return false
	if (WINDOWS_ABSOLUTE_REGEX.test(normalized)) return false
	return !hasParentTraversal(normalized)
}

function resolveImageSrc(
	element: ImageElementWithEmbed,
	workspaceState: MediaImageWorkspaceState,
	toFileUrl: (absolutePath: string) => string,
): string {
	const { tabPath, workspacePath } = workspaceState
	const { url = "", embedTarget } = element
	const rawUrl = embedTarget || url

	if (!rawUrl) {
		return ""
	}

	if (embedTarget && !isSafeEmbedTarget(embedTarget)) {
		return ""
	}

	if (rawUrl.startsWith("http")) {
		return rawUrl
	}

	let baseSrc: string

	if (isAbsolute(rawUrl)) {
		baseSrc = rawUrl
	} else if (embedTarget) {
		if (!workspacePath) {
			return ""
		}
		baseSrc = resolve(workspacePath, rawUrl)
	} else {
		if (!tabPath) {
			return ""
		}
		baseSrc = resolve(dirname(tabPath), rawUrl)
	}

	baseSrc = toFileUrl(baseSrc)
	const cacheBuster = Date.now()
	const separator = baseSrc.includes("?") ? "&" : "?"
	return `${baseSrc}${separator}nocache=${cacheBuster}`
}

export const createImageElement = (host: MediaImageHostDeps): NodeComponent =>
	withHOC(
		ResizableProvider,
		function ImageElement(props: PlateElementProps<TImageElement>) {
			const workspaceState = host.useWorkspaceState()
			const { align = "center", focused, readOnly, selected } = useMediaState()
			const width = useResizableValue("width")
			const [hasError, setHasError] = useState(false)

			const element = props.element as ImageElementWithEmbed
			const src = useMemo(
				() => resolveImageSrc(element, workspaceState, host.toFileUrl),
				[element, workspaceState],
			)

			const isEmbedImage = Boolean(element.embedTarget)

			return (
				<MediaToolbar
					hide={hasError}
					toolbarContent={
						<MediaImageModeSwitch workspaceState={workspaceState} />
					}
					showCaption={!isEmbedImage}
				>
					<PlateElement {...props} className="py-2.5">
						{hasError ? (
							<div
								className={cn(
									"flex flex-col items-center justify-center w-full min-h-[200px] bg-muted rounded-sm borderpx-4 py-8 cursor-default",
									focused && selected && "ring-2 ring-ring ring-offset-2",
								)}
								contentEditable={false}
							>
								<ImageOff className="w-12 h-12 text-muted-foreground/50 mb-3" />
								<p className="text-sm text-muted-foreground text-center">
									Failed to load image. Please check the file path.
								</p>
							</div>
						) : (
							<figure className="group relative m-0" contentEditable={false}>
								<Resizable
									align={align}
									options={{
										align,
										readOnly,
									}}
								>
									<ResizeHandle
										className={mediaResizeHandleVariants({ direction: "left" })}
										options={{ direction: "left" }}
									/>
									<Image
										className={cn(
											"block w-full max-w-full cursor-pointer object-cover px-0",
											"rounded-sm",
											focused && selected && "ring-2 ring-ring ring-offset-2",
										)}
										alt={props.attributes.alt as string | undefined}
										src={src}
										onError={() => setHasError(true)}
									/>
									<ResizeHandle
										className={mediaResizeHandleVariants({
											direction: "right",
										})}
										options={{ direction: "right" }}
									/>
								</Resizable>

								{!isEmbedImage && (
									<Caption style={{ width }} align={align}>
										<CaptionTextarea
											readOnly={readOnly}
											onFocus={(e) => {
												e.preventDefault()
											}}
											placeholder="Write a caption..."
										/>
									</Caption>
								)}
							</figure>
						)}

						{props.children}
					</PlateElement>
				</MediaToolbar>
			)
		},
	)
