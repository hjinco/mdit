import { Image, ImagePlugin, useMediaState } from "@platejs/media/react"
import { ResizableProvider, useResizableValue } from "@platejs/resizable"
import { convertFileSrc } from "@tauri-apps/api/core"
import { ImageOff } from "lucide-react"
import { dirname, isAbsolute, resolve } from "pathe"
import type { TImageElement } from "platejs"
import type { PlateElementProps } from "platejs/react"
import { PlateElement, withHOC } from "platejs/react"
import { useMemo, useState } from "react"
import { useShallow } from "zustand/shallow"
import { cn } from "@/lib/utils"
import { useStore } from "@/store"
import { Caption, CaptionTextarea } from "./caption"
import { MediaToolbar } from "./media-toolbar"
import {
	mediaResizeHandleVariants,
	Resizable,
	ResizeHandle,
} from "./resize-handle"

export const ImageElement = withHOC(
	ResizableProvider,
	function ImageElement(props: PlateElementProps<TImageElement>) {
		const { tabPath, workspacePath } = useStore(
			useShallow((state) => ({
				tabPath: state.tab?.path,
				workspacePath: state.workspacePath,
			})),
		)
		const { align = "center", focused, readOnly, selected } = useMediaState()
		const width = useResizableValue("width")
		const [hasError, setHasError] = useState(false)

		const src = useMemo(() => {
			const {
				url = "",
				wiki,
				wikiTarget,
			} = props.element as TImageElement & {
				wiki?: boolean
				wikiTarget?: string
			}

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

			baseSrc = convertFileSrc(baseSrc)
			// Add cache-busting query parameter using current timestamp
			// This ensures the browser always fetches a fresh copy, bypassing cache
			const cacheBuster = Date.now()
			const separator = baseSrc.includes("?") ? "&" : "?"
			return `${baseSrc}${separator}nocache=${cacheBuster}`
		}, [tabPath, workspacePath, props.element])

		const isWikiImage = Boolean(
			(props.element as { wiki?: boolean; wikiTarget?: string }).wiki ||
				(props.element as { wiki?: boolean; wikiTarget?: string }).wikiTarget,
		)

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
