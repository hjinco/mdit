import { convertFileSrc } from "@tauri-apps/api/core"
import { stat } from "@tauri-apps/plugin-fs"
import { ImageOff } from "lucide-react"
import { basename } from "pathe"
import { useEffect, useMemo, useRef, useState } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog"
import { formatFileSize } from "@/utils/format-utils"
import { getImageProperties } from "./utils/image-process-utils"

export function ImagePreviewDialog() {
	const { imagePreviewPath, closeImagePreview } = useStore(
		useShallow((state) => ({
			imagePreviewPath: state.imagePreviewPath,
			closeImagePreview: state.closeImagePreview,
		})),
	)

	const [hasError, setHasError] = useState(false)
	const [isImageReady, setIsImageReady] = useState(false)
	const [displayPath, setDisplayPath] = useState<string | null>(null)
	const [displayFilename, setDisplayFilename] = useState("")
	const [imageProperties, setImageProperties] = useState<{
		width: number
		height: number
		format: string
	} | null>(null)
	const [fileSize, setFileSize] = useState<number | null>(null)
	const timeoutRef = useRef<number | null>(null)

	const src = useMemo(() => {
		if (!displayPath) return ""
		if (displayPath.startsWith("http")) {
			return displayPath
		}
		return convertFileSrc(displayPath)
	}, [displayPath])

	useEffect(() => {
		if (imagePreviewPath) {
			setDisplayPath(imagePreviewPath)
			setHasError(false)
			setIsImageReady(false)
			setImageProperties(null)
			setFileSize(null)
			setDisplayFilename(basename(imagePreviewPath))

			// Fetch image properties and file size
			Promise.all([
				getImageProperties(imagePreviewPath)
					.then(setImageProperties)
					.catch((error) => {
						console.error("Failed to get image properties:", error)
						setImageProperties(null)
					}),
				stat(imagePreviewPath)
					.then((fileStat) => {
						setFileSize(fileStat.size ?? null)
					})
					.catch((error) => {
						console.error("Failed to get file size:", error)
						setFileSize(null)
					}),
			])
		} else {
			if (timeoutRef.current) {
				window.clearTimeout(timeoutRef.current)
			}
			timeoutRef.current = window.setTimeout(() => {
				setDisplayPath(null)
				setDisplayFilename("")
				setIsImageReady(false)
				setHasError(false)
				setImageProperties(null)
				setFileSize(null)
				timeoutRef.current = null
			}, 200)
		}

		return () => {
			if (timeoutRef.current) {
				window.clearTimeout(timeoutRef.current)
				timeoutRef.current = null
			}
		}
	}, [imagePreviewPath])

	useEffect(() => {
		if (displayPath) {
			setHasError(false)
			setIsImageReady(false)
		}
	}, [displayPath])

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			closeImagePreview()
		}
	}

	return (
		<>
			{src && !isImageReady && !hasError && (
				<img
					src={src}
					alt=""
					className="hidden"
					onLoad={() => setIsImageReady(true)}
					onError={() => {
						setHasError(true)
						setIsImageReady(true)
					}}
				/>
			)}
			<Dialog
				open={!!imagePreviewPath && (isImageReady || hasError)}
				onOpenChange={handleOpenChange}
			>
				<DialogContent
					className="max-w-[90vw] max-h-[90vh] p-0 border-none rounded-none shadow-none"
					showCloseButton={false}
				>
					<div className="group relative flex items-center justify-center w-full h-full max-h-[90vh] overflow-auto">
						{hasError ? (
							<div className="flex flex-col items-center justify-center min-h-[300px] py-8">
								<ImageOff className="w-16 h-16 text-muted-foreground/50 mb-4" />
								<p className="text-sm text-muted-foreground text-center">
									Failed to load image. Please check the file path.
								</p>
							</div>
						) : (
							src && (
								<>
									<img
										src={src}
										alt={displayFilename}
										className="max-w-full max-h-full object-contain"
									/>
									{/* Hover overlay with mask-image effect */}
									<div
										className="absolute top-0 left-0 right-0 opacity-0 bg-black/50 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
										style={{
											maskImage:
												"linear-gradient(to bottom, black, transparent)",
											WebkitMaskImage:
												"linear-gradient(to bottom, black, transparent)",
											maskRepeat: "no-repeat",
											WebkitMaskRepeat: "no-repeat",
										}}
									>
										<div className="text-white drop-shadow-lg p-2">
											<DialogTitle className="text-lg font-semibold truncate">
												{displayFilename}
											</DialogTitle>
											{imageProperties && (
												<div className="text-xs pb-12">
													{imageProperties.width} × {imageProperties.height}
													{fileSize !== null && (
														<span className="ml-2">
															• {formatFileSize(fileSize)}
														</span>
													)}
												</div>
											)}
										</div>
									</div>
								</>
							)
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}
