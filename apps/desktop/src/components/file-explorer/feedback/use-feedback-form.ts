import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { useCallback, useState } from "react"
import { useForm } from "react-hook-form"
import { submitFeedback } from "./feedback-api"
import {
	type FeedbackFormValues,
	feedbackFormSchema,
	type SubmitStatus,
} from "./feedback-schema"

type UseFeedbackFormOptions = {
	apiUrl: string
	screenshot: string
}

export function useFeedbackForm({
	apiUrl,
	screenshot,
}: UseFeedbackFormOptions) {
	const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle")
	const form = useForm<FeedbackFormValues>({
		resolver: standardSchemaResolver(feedbackFormSchema),
		mode: "onChange",
		defaultValues: {
			message: "",
			email: "",
		},
	})

	const resetFormState = useCallback(() => {
		form.reset()
		setSubmitStatus("idle")
	}, [form])

	const onSubmit = useCallback(
		async (values: FeedbackFormValues) => {
			setSubmitStatus("loading")
			try {
				await submitFeedback(apiUrl, {
					message: values.message,
					email: values.email || undefined,
					screenshot: screenshot || undefined,
				})
				setSubmitStatus("success")
			} catch (error) {
				console.error("Failed to send feedback:", error)
				setSubmitStatus("error")
			}
		},
		[apiUrl, screenshot],
	)

	return {
		form,
		submitStatus,
		setSubmitStatus,
		resetFormState,
		onSubmit,
	}
}
