import { Button } from "@mdit/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@mdit/ui/components/field"
import {
	Form,
	FormControl,
	FormField,
	FormItem,
} from "@mdit/ui/components/form"
import { Input } from "@mdit/ui/components/input"
import { Textarea } from "@mdit/ui/components/textarea"
import { CameraIcon, CheckIcon, Loader2Icon, XIcon } from "lucide-react"
import { useEffect } from "react"
import { useScreenCapture } from "@/contexts/screen-capture-context"
import type { SubmitStatus } from "./feedback-schema"
import { useFeedbackForm } from "./use-feedback-form"

type FeedbackFormProps = {
	onCapture: () => void
	onCancel: () => void
}

export function FeedbackForm({ onCapture, onCancel }: FeedbackFormProps) {
	const apiUrl = import.meta.env.VITE_FEEDBACK_API_URL
	if (!apiUrl) {
		return null
	}

	return (
		<FeedbackFormContent
			apiUrl={apiUrl}
			onCapture={onCapture}
			onCancel={onCancel}
		/>
	)
}

type FeedbackFormContentProps = {
	apiUrl: string
	onCapture: () => void
	onCancel: () => void
}

const submitButtonLabelByStatus: Record<SubmitStatus, string> = {
	idle: "Send",
	loading: "Sending",
	success: "Sent!",
	error: "Try again",
}

function FeedbackFormContent({
	apiUrl,
	onCapture,
	onCancel,
}: FeedbackFormContentProps) {
	const { screenshot, setScreenshot } = useScreenCapture()

	const { form, submitStatus, setSubmitStatus, resetFormState, onSubmit } =
		useFeedbackForm({
			apiUrl,
			screenshot,
		})

	useEffect(() => {
		if (submitStatus === "success") {
			const timer = setTimeout(() => {
				resetFormState()
				setScreenshot("")
				onCancel()
			}, 1500)
			return () => clearTimeout(timer)
		}
		if (submitStatus === "error") {
			const timer = setTimeout(() => {
				setSubmitStatus("idle")
			}, 1500)
			return () => clearTimeout(timer)
		}
	}, [onCancel, resetFormState, setSubmitStatus, submitStatus, setScreenshot])

	const handleSubmit = form.handleSubmit(onSubmit)

	const handleRemoveScreenshot = () => {
		setScreenshot("")
	}

	const handleCapture = () => {
		onCapture()
	}

	const handleCancel = () => {
		resetFormState()
		setScreenshot("")
		onCancel()
	}

	return (
		<Form {...form}>
			<form onSubmit={handleSubmit} className="space-y-4">
				<FieldGroup className="gap-3">
					<Field>
						<FieldLabel>Email</FieldLabel>
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormItem>
									<FormControl>
										<Input
											{...field}
											type="email"
											placeholder="your@email.com"
											className="rounded"
										/>
									</FormControl>
								</FormItem>
							)}
						/>
					</Field>
					<Field>
						<FieldLabel className="gap-1">
							Feedback <span className="text-destructive">*</span>
						</FieldLabel>
						<FormField
							control={form.control}
							name="message"
							render={({ field }) => (
								<FormItem>
									<FormControl>
										<Textarea
											{...field}
											placeholder="Share your feedback..."
											className="min-h-48 rounded"
											spellCheck="false"
										/>
									</FormControl>
								</FormItem>
							)}
						/>
					</Field>
					<Field>
						<FieldLabel>Screenshot</FieldLabel>
						<div className="space-y-2">
							{screenshot ? (
								<div className="relative">
									<div
										className="w-full rounded border max-h-48 min-h-32 bg-center bg-no-repeat bg-contain"
										style={{ backgroundImage: `url(${screenshot})` }}
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="absolute top-2 right-2 size-6 rounded"
										onClick={handleRemoveScreenshot}
									>
										<XIcon />
									</Button>
								</div>
							) : (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleCapture}
									className="w-full rounded"
								>
									<CameraIcon />
									Capture
								</Button>
							)}
						</div>
					</Field>
				</FieldGroup>
				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="rounded"
						onClick={handleCancel}
						disabled={submitStatus === "loading" || submitStatus === "success"}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						size="sm"
						className="rounded"
						variant={submitStatus === "error" ? "destructive" : "default"}
						disabled={
							submitStatus === "loading" ||
							submitStatus === "success" ||
							!form.formState.isValid
						}
					>
						{submitStatus === "loading" && (
							<Loader2Icon className="size-4 animate-spin will-change-transform" />
						)}
						{submitStatus === "success" && <CheckIcon className="size-4" />}
						{submitButtonLabelByStatus[submitStatus]}
					</Button>
				</div>
			</form>
		</Form>
	)
}
