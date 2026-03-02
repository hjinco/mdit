import type { ValidatedLicenseKey } from "@polar-sh/sdk/models/components/validatedlicensekey.js"
import type { BetterAuthPlugin } from "better-auth"
import { createAuthEndpoint } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import { parseUserOutput } from "better-auth/db"
import { z } from "zod"

const POLAR_LICENSE_PROVIDER_ID = "polar-license"
const POLAR_LICENSE_GRANTED_STATUS = "granted"
const LICENSE_KEY_REQUIRED_ERROR = {
	code: "LICENSE_KEY_REQUIRED",
	message: "License key is required",
} as const
const INVALID_LICENSE_KEY_ERROR = {
	code: "INVALID_LICENSE_KEY",
	message: "Invalid license key",
} as const
const POLAR_NOT_CONFIGURED_ERROR = {
	code: "POLAR_NOT_CONFIGURED",
	message: "Polar is not configured",
} as const
const POLAR_VALIDATION_FAILED_ERROR = {
	code: "POLAR_VALIDATION_FAILED",
	message: "Failed to validate license key",
} as const
const INVALID_LICENSE_ERROR_STATUSES = new Set([404, 422])

export type PolarLicensePluginOptions = {
	isConfigured: () => boolean
	validateLicenseKey: (key: string) => Promise<ValidatedLicenseKey>
}

type PolarValidationErrorType = "invalid" | "upstream"

const signInLicenseKeyBodySchema = z.object({
	key: z.string(),
	rememberMe: z.boolean().optional(),
})

const isInvalidPolarErrorStatus = (statusCode: number): boolean =>
	INVALID_LICENSE_ERROR_STATUSES.has(statusCode)

const classifyPolarValidationError = (
	error: unknown,
): PolarValidationErrorType => {
	if (typeof error === "object" && error !== null) {
		const statusCode = (error as { statusCode?: unknown }).statusCode
		if (
			typeof statusCode === "number" &&
			isInvalidPolarErrorStatus(statusCode)
		) {
			return "invalid"
		}
	}
	return "upstream"
}

const toUserName = (license: ValidatedLicenseKey): string => {
	const customerName = license.customer.name?.trim()
	if (customerName) {
		return customerName
	}
	return license.customer.email
}

type ErrorResponseContext<TStatus> = {
	setStatus: (status: TStatus) => void
	json: (body: Record<string, string>) => unknown
}

const withErrorResponse = <TStatus>(
	ctx: ErrorResponseContext<TStatus>,
	status: TStatus,
	body: Record<string, string>,
) => {
	ctx.setStatus(status)
	return ctx.json(body)
}

export const polarLicensePlugin = ({
	isConfigured,
	validateLicenseKey,
}: PolarLicensePluginOptions): BetterAuthPlugin => ({
	id: POLAR_LICENSE_PROVIDER_ID,
	endpoints: {
		signInLicenseKey: createAuthEndpoint(
			"/sign-in/license-key",
			{
				method: "POST",
				body: signInLicenseKeyBodySchema,
			},
			async (ctx) => {
				if (!isConfigured()) {
					return withErrorResponse(ctx, 503, POLAR_NOT_CONFIGURED_ERROR)
				}

				const key = ctx.body.key.trim()
				if (!key) {
					return withErrorResponse(ctx, 400, LICENSE_KEY_REQUIRED_ERROR)
				}

				let validatedLicense: ValidatedLicenseKey
				try {
					validatedLicense = await validateLicenseKey(key)
				} catch (error) {
					const errorType = classifyPolarValidationError(error)
					if (errorType === "invalid") {
						return withErrorResponse(ctx, 401, INVALID_LICENSE_KEY_ERROR)
					}
					return withErrorResponse(ctx, 502, POLAR_VALIDATION_FAILED_ERROR)
				}

				if (validatedLicense.status !== POLAR_LICENSE_GRANTED_STATUS) {
					return withErrorResponse(ctx, 401, INVALID_LICENSE_KEY_ERROR)
				}

				const account = (await ctx.context.adapter.findOne({
					model: "account",
					where: [
						{ field: "providerId", value: POLAR_LICENSE_PROVIDER_ID },
						{ field: "accountId", value: validatedLicense.customerId },
					],
				})) as { userId: string } | null

				let user: any = null

				if (account) {
					user = await ctx.context.internalAdapter.findUserById(account.userId)
					if (!user) {
						return withErrorResponse(ctx, 502, POLAR_VALIDATION_FAILED_ERROR)
					}
				} else {
					const existingUser =
						await ctx.context.internalAdapter.findUserByEmail(
							validatedLicense.customer.email,
						)

					if (existingUser) {
						user = existingUser.user
					} else {
						user = await ctx.context.internalAdapter.createUser({
							email: validatedLicense.customer.email,
							name: toUserName(validatedLicense),
							emailVerified: validatedLicense.customer.emailVerified,
						})
					}

					if (!user) {
						return withErrorResponse(ctx, 502, POLAR_VALIDATION_FAILED_ERROR)
					}

					await ctx.context.internalAdapter.createAccount({
						userId: user.id,
						providerId: POLAR_LICENSE_PROVIDER_ID,
						accountId: validatedLicense.customerId,
					})
				}

				const session = await ctx.context.internalAdapter.createSession(
					user.id,
					ctx.body.rememberMe === false,
				)
				if (!session) {
					return withErrorResponse(ctx, 502, POLAR_VALIDATION_FAILED_ERROR)
				}

				await setSessionCookie(
					ctx,
					{
						session,
						user,
					},
					ctx.body.rememberMe === false,
				)

				return ctx.json({
					token: session.token,
					user: parseUserOutput(ctx.context.options, user),
				})
			},
		),
	},
})
