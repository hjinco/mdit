import type { FeedbackFormValues } from "./feedback-schema"

type FeedbackPayload = {
	message: FeedbackFormValues["message"]
	email?: string
	screenshot?: string
}

export async function submitFeedback(apiUrl: string, payload: FeedbackPayload) {
	const response = await fetch(apiUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	})

	if (!response.ok) {
		throw new Error(`Failed to send feedback: ${response.statusText}`)
	}
}
