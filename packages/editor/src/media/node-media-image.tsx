import { cn } from "@mdit/ui/lib/utils"
import { Image, ImagePlugin, useMediaState } from "@platejs/media/react"
import { ResizableProvider, useResizableValue } from "@platejs/resizable"
import { ImageOff } from "lucide-react"
import { dirname, isAbsolute, resolve } from "pathe"
import type { NodeComponent, TImageElement } from "platejs"
import type { PlateElementProps } from "platejs/react"
import { PlateElement, withHOC } from "platejs/react"
import { useMemo, useState } from "react"
import { Caption, CaptionTextarea } from "../media/caption"
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

type ImageElementWithWiki = TImageElement & {
	wiki?: boolean
	wikiTarget?: string
}

function resolveImageSrc(
	element: ImageElementWithWiki,
	workspaceState: MediaImageWorkspaceState,
	toFileUrl: (absolutePath: string) => string,
): string {
	const { tabPath, workspacePath } = workspaceState
	const { url = "", wiki, wikiTarget } = element
	const rawUrl = wikiTarget || url

	if (!rawUrl) {
		return ""
	}

	if (rawUrl.startsWith("http")) {
		return rawUrl
	}

	let baseSrc: string

	if (isAbsolute(rawUrl)) {
		baseSrc = rawUrl
	} else if (wiki || wikiTarget) {
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

			const element = props.element as ImageElementWithWiki
			const src = useMemo(
				() => resolveImageSrc(element, workspaceState, host.toFileUrl),
				[element, workspaceState],
			)

			const isWikiImage = Boolean(element.wiki || element.wikiTarget)

			return (
				<MediaToolbar plugin={ImagePlugin} hide={hasError}>
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

								{!isWikiImage && (
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
