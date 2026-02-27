import { z } from "zod"

export const feedbackFormSchema = z.object({
	message: z.string().min(1, "Message is required"),
	email: z
		.string()
		.refine((val) => val === "" || z.email().safeParse(val).success, {
			message: "Invalid email",
		})
		.optional(),
})

export type FeedbackFormValues = z.infer<typeof feedbackFormSchema>

export type SubmitStatus = "idle" | "loading" | "success" | "error"
