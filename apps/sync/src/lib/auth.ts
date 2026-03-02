import { env } from "cloudflare:workers"
import { Polar } from "@polar-sh/sdk"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { drizzle } from "drizzle-orm/d1"
import * as schema from "../db/schema"
import { polarLicensePlugin } from "./polar-license-plugin"

const polar = new Polar()
const isPolarConfigured = (): boolean =>
	typeof env.POLAR_ORGANIZATION_ID === "string" &&
	env.POLAR_ORGANIZATION_ID.trim().length > 0

export const auth = betterAuth({
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	database: drizzleAdapter(drizzle(env.DB), {
		provider: "sqlite",
		schema,
	}),
	plugins: [
		polarLicensePlugin({
			isConfigured: isPolarConfigured,
			validateLicenseKey: (key) =>
				polar.customerPortal.licenseKeys.validate({
					key,
					organizationId: env.POLAR_ORGANIZATION_ID,
				}),
		}),
	],
})
