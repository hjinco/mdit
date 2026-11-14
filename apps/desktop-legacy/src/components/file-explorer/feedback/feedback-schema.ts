import { z } from "zod"

export const feedbackFormSchema = z.object({
	message: z.string().min(1, "Message is required"),
	email: z
		.union([z.string().email({ message: "Invalid email" }), z.literal("")])
		.optional(),
})

export type FeedbackFormValues = z.infer<typeof feedbackFormSchema>

export type SubmitStatus = "idle" | "loading" | "success" | "error"
