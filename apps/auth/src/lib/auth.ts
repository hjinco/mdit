import { env, waitUntil } from "cloudflare:workers"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { createAuthMiddleware } from "better-auth/api"
import { bearer } from "better-auth/plugins/bearer"
import { drizzle } from "drizzle-orm/d1"
import * as schema from "../db/schema"
import { resend } from "./email"
import { verifyAuthSessionFromAuthorization } from "./session"
import { SIGN_UP_EMAIL_PATH, withDefaultSignupName } from "./signup"

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(drizzle(env.DB), {
		provider: "sqlite",
		schema,
	}),
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path !== SIGN_UP_EMAIL_PATH) {
				return
			}

			return {
				context: {
					body: withDefaultSignupName(ctx.body),
				},
			}
		}),
	},
	emailAndPassword: {
		enabled: true,
	},
	plugins: [bearer()],
	emailVerification: {
		sendOnSignUp: true,
		sendVerificationEmail: async ({ user, url }) => {
			waitUntil(
				resend.emails.send({
					from: "verify@mdit.app",
					to: user.email,
					subject: "Verify your email address",
					text: `Click the link to verify your email: ${url}`,
				}),
			)
		},
	},
})

export const verifyAuthorizationHeader = (authorizationHeader: string | null) =>
	verifyAuthSessionFromAuthorization(auth, authorizationHeader)
