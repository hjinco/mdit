import { env, waitUntil } from "cloudflare:workers"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { drizzle } from "drizzle-orm/d1"
import * as schema from "../db/schema"
import { resend } from "./email"

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(drizzle(env.DB), {
		provider: "sqlite",
		schema,
	}),
	emailAndPassword: {
		enabled: true,
	},
	emailVerification: {
		sendOnSignUp: true,
		sendVerificationEmail: async ({ user, url }) => {
			waitUntil(
				resend.emails.send({
					from: "onboarding@mdit.app",
					to: user.email,
					subject: "Verify your email address",
					text: `Click the link to verify your email: ${url}`,
				}),
			)
		},
	},
})
