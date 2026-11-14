import { Button } from "@mdit/ui/components/button"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@mdit/ui/components/popover"
import { SendIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useScreenCapture } from "@/contexts/screen-capture-context"
import { FeedbackForm } from "./feedback-form"

export function FeedbackButton() {
	const [open, setOpen] = useState(false)
	const { onStartCapture, isCapturing } = useScreenCapture()
	const wasOpenBeforeCapture = useRef(false)

	const handlePopoverOpenChange = (newOpen: boolean) => {
		setOpen(newOpen)
	}

	const handleCapture = () => {
		wasOpenBeforeCapture.current = open
		setOpen(false)
		onStartCapture()
	}

	const handleCancel = () => {
		setOpen(false)
	}

	useEffect(() => {
		if (!isCapturing && wasOpenBeforeCapture.current) {
			setOpen(true)
			wasOpenBeforeCapture.current = false
		}
	}, [isCapturing])

	return (
		<Popover open={open} onOpenChange={handlePopoverOpenChange}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					className="text-foreground/80 justify-start hover:bg-background/40 px-1.5!"
					size="sm"
				>
					<SendIcon className="size-4" /> Feedback
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-120" align="start">
				<FeedbackForm onCapture={handleCapture} onCancel={handleCancel} />
			</PopoverContent>
		</Popover>
	)
}
