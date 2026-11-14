import html2canvas from "html2canvas-pro"
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useEffectEvent,
	useState,
} from "react"

interface ScreenCaptureContextType {
	onStartCapture: () => void
	screenshot: string
	setScreenshot: (screenshot: string) => void
	isCapturing: boolean
}

const ScreenCaptureContext = createContext<ScreenCaptureContextType | null>(
	null,
)

export function useScreenCapture() {
	const context = useContext(ScreenCaptureContext)
	if (!context) {
		throw new Error(
			"useScreenCapture must be used within ScreenCaptureProvider",
		)
	}
	return context
}

interface ScreenCaptureProviderProps {
	children: ReactNode
}

export function ScreenCaptureProvider({
	children,
}: ScreenCaptureProviderProps) {
	const [screenshot, setScreenshot] = useState<string>("")
	const [isCapturing, setIsCapturing] = useState(false)
	const [startX, setStartX] = useState(0)
	const [startY, setStartY] = useState(0)
	const [crossHairsTop, setCrossHairsTop] = useState(0)
	const [crossHairsLeft, setCrossHairsLeft] = useState(0)
	const [isMouseDown, setIsMouseDown] = useState(false)
	const [windowWidth, setWindowWidth] = useState(0)
	const [windowHeight, setWindowHeight] = useState(0)
	const [borderWidth, setBorderWidth] = useState<string | number>(0)
	const [cropPositionTop, setCropPositionTop] = useState(0)
	const [cropPositionLeft, setCropPositionLeft] = useState(0)
	const [cropWidth, setCropWidth] = useState(0)
	const [cropHeight, setCropHeight] = useState(0)

	const handleWindowResize = useEffectEvent(() => {
		const width =
			window.innerWidth ||
			document.documentElement.clientWidth ||
			document.body.clientWidth
		const height =
			window.innerHeight ||
			document.documentElement.clientHeight ||
			document.body.clientHeight
		setWindowWidth(width)
		setWindowHeight(height)
	})

	useEffect(() => {
		const onResize = () => {
			handleWindowResize()
		}

		onResize()
		window.addEventListener("resize", onResize)
		return () => {
			window.removeEventListener("resize", onResize)
		}
	}, [])

	const handleStartCapture = () => {
		setIsCapturing(true)
		// Give time for UI to hide before capturing
		setTimeout(() => {
			// Capture mode is now active
		}, 100)
	}

	const takeScreenShot = useEffectEvent(async () => {
		const body = document.querySelector("body")
		if (!body) return

		// Don't capture if no area was selected
		if (cropWidth <= 0 || cropHeight <= 0) {
			setIsCapturing(false)
			setIsMouseDown(false)
			setBorderWidth(0)
			setCrossHairsTop(0)
			setCrossHairsLeft(0)
			return
		}

		try {
			const canvas = await html2canvas(body)
			const croppedCanvas = document.createElement("canvas")
			const croppedCanvasContext = croppedCanvas.getContext("2d")

			if (!croppedCanvasContext) return

			croppedCanvas.width = cropWidth
			croppedCanvas.height = cropHeight

			croppedCanvasContext.drawImage(
				canvas,
				cropPositionLeft,
				cropPositionTop,
				cropWidth,
				cropHeight,
				0,
				0,
				cropWidth,
				cropHeight,
			)

			const dataURL = croppedCanvas.toDataURL()
			setScreenshot(dataURL)
			setIsCapturing(false)
		} catch (error) {
			console.error("Failed to capture screenshot:", error)
			setIsCapturing(false)
		}
	})

	const handleMouseMove = useEffectEvent((event: MouseEvent) => {
		if (!isCapturing) return

		let cropPositionTop = startY
		let cropPositionLeft = startX

		const currentEndX = event.clientX
		const currentEndY = event.clientY

		const isStartTop = currentEndY >= startY
		const isStartBottom = currentEndY <= startY
		const isStartLeft = currentEndX >= startX
		const isStartRight = currentEndX <= startX

		const isStartTopLeft = isStartTop && isStartLeft
		const isStartTopRight = isStartTop && isStartRight
		const isStartBottomLeft = isStartBottom && isStartLeft
		const isStartBottomRight = isStartBottom && isStartRight

		let newBorderWidth: string | number = borderWidth
		let newCropWidth = 0
		let newCropHeight = 0

		if (isMouseDown) {
			if (isStartTopLeft) {
				newBorderWidth = `${startY}px ${windowWidth - currentEndX}px ${
					windowHeight - currentEndY
				}px ${startX}px`
				newCropWidth = currentEndX - startX
				newCropHeight = currentEndY - startY
			}
			if (isStartTopRight) {
				newBorderWidth = `${startY}px ${windowWidth - startX}px ${
					windowHeight - currentEndY
				}px ${currentEndX}px`
				newCropWidth = startX - currentEndX
				newCropHeight = currentEndY - startY
				cropPositionLeft = currentEndX
			}
			if (isStartBottomLeft) {
				newBorderWidth = `${currentEndY}px ${windowWidth - currentEndX}px ${
					windowHeight - startY
				}px ${startX}px`
				newCropWidth = currentEndX - startX
				newCropHeight = startY - currentEndY
				cropPositionTop = currentEndY
			}
			if (isStartBottomRight) {
				newBorderWidth = `${currentEndY}px ${windowWidth - startX}px ${
					windowHeight - startY
				}px ${currentEndX}px`
				newCropWidth = startX - currentEndX
				newCropHeight = startY - currentEndY
				cropPositionLeft = currentEndX
				cropPositionTop = currentEndY
			}
		}

		const devicePixelRatio = window.devicePixelRatio || 1
		const scaledCropWidth = newCropWidth * devicePixelRatio
		const scaledCropHeight = newCropHeight * devicePixelRatio
		const scaledCropPositionLeft = cropPositionLeft * devicePixelRatio
		const scaledCropPositionTop = cropPositionTop * devicePixelRatio

		setCrossHairsTop(event.clientY)
		setCrossHairsLeft(event.clientX)
		setBorderWidth(newBorderWidth)
		setCropWidth(scaledCropWidth)
		setCropHeight(scaledCropHeight)
		setCropPositionTop(scaledCropPositionTop)
		setCropPositionLeft(scaledCropPositionLeft)
	})

	const handleMouseDown = useEffectEvent((event: MouseEvent) => {
		if (!isCapturing) return

		const x = event.clientX
		const y = event.clientY
		const devicePixelRatio = window.devicePixelRatio || 1

		setStartX(x)
		setStartY(y)
		setCropPositionTop(y * devicePixelRatio)
		setCropPositionLeft(x * devicePixelRatio)
		setIsMouseDown(true)
		setBorderWidth(`${windowWidth}px ${windowHeight}px`)
	})

	const handleMouseUp = useEffectEvent(() => {
		if (!isCapturing || !isMouseDown) return

		void takeScreenShot()
		setIsCapturing(false)
		setIsMouseDown(false)
		setBorderWidth(0)
		setCrossHairsTop(0)
		setCrossHairsLeft(0)
	})

	useEffect(() => {
		if (!isCapturing) {
			setIsMouseDown(false)
			setBorderWidth(0)
			setCrossHairsTop(0)
			setCrossHairsLeft(0)
			return
		}

		const onMouseMove = (event: MouseEvent) => {
			handleMouseMove(event)
		}
		const onMouseDown = (event: MouseEvent) => {
			handleMouseDown(event)
		}
		const onMouseUp = () => {
			handleMouseUp()
		}

		window.addEventListener("mousemove", onMouseMove)
		window.addEventListener("mousedown", onMouseDown)
		window.addEventListener("mouseup", onMouseUp)

		return () => {
			window.removeEventListener("mousemove", onMouseMove)
			window.removeEventListener("mousedown", onMouseDown)
			window.removeEventListener("mouseup", onMouseUp)
		}
	}, [isCapturing])

	return (
		<ScreenCaptureContext.Provider
			value={{
				onStartCapture: handleStartCapture,
				screenshot,
				setScreenshot,
				isCapturing,
			}}
		>
			{children}
			{isCapturing && (
				<>
					<div
						className="fixed inset-0 z-9999 cursor-crosshair"
						style={{
							borderWidth:
								typeof borderWidth === "string"
									? borderWidth
									: `${borderWidth}px`,
							borderStyle: "solid",
							borderColor: "rgba(0, 0, 0, 0.5)",
							pointerEvents: "auto",
						}}
					/>
					{isMouseDown && (
						<div
							className="fixed z-10000 pointer-events-none"
							style={{
								left: `${crossHairsLeft}px`,
								top: `${crossHairsTop}px`,
								width: "20px",
								height: "20px",
								marginLeft: "-10px",
								marginTop: "-10px",
								border: "2px solid rgba(255, 255, 255, 0.8)",
								borderRadius: "50%",
								boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.5)",
							}}
						/>
					)}
				</>
			)}
		</ScreenCaptureContext.Provider>
	)
}
