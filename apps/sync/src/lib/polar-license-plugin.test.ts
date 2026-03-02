import type { ValidatedLicenseKey } from "@polar-sh/sdk/models/components/validatedlicensekey.js"
import { betterAuth } from "better-auth"
import { type MemoryDB, memoryAdapter } from "better-auth/adapters/memory"
import { describe, expect, it, vi } from "vitest"
import { polarLicensePlugin } from "./polar-license-plugin"

const BASE_URL = "http://localhost:8787"
const SIGN_IN_LICENSE_PATH = `${BASE_URL}/api/auth/sign-in/license-key`

type AuthLike = {
	handler: (request: Request) => Promise<Response>
	$context: Promise<{
		internalAdapter: {
			createUser: (
				input: Record<string, unknown>,
			) => Promise<Record<string, any>>
		}
	}>
}

type ValidatedLicenseOverrides = Omit<
	Partial<ValidatedLicenseKey>,
	"customer"
> & {
	customer?: Partial<ValidatedLicenseKey["customer"]>
}

const createValidatedLicense = (
	overrides: ValidatedLicenseOverrides = {},
): ValidatedLicenseKey => {
	const base: ValidatedLicenseKey = {
		id: "license-id",
		createdAt: new Date(),
		modifiedAt: null,
		organizationId: "org-id",
		customerId: "customer-id",
		customer: {
			id: "customer-id",
			createdAt: new Date(),
			modifiedAt: null,
			metadata: {},
			externalId: null,
			email: "customer@mdit.app",
			emailVerified: true,
			type: "individual",
			name: "Mdit Customer",
			billingAddress: null,
			taxId: null,
			locale: null,
			organizationId: "org-id",
			deletedAt: null,
			avatarUrl: "https://example.com/avatar.png",
		},
		benefitId: "benefit-id",
		key: "license-key",
		displayKey: "XXXX-XXXX",
		status: "granted",
		limitActivations: null,
		usage: 1,
		limitUsage: null,
		validations: 1,
		lastValidatedAt: new Date(),
		expiresAt: null,
		activation: null,
	}

	return {
		...base,
		...overrides,
		customer: {
			...base.customer,
			...(overrides.customer ?? {}),
		},
	}
}

const createAuth = (options?: {
	isConfigured?: boolean
	validateLicenseKey?: (key: string) => Promise<ValidatedLicenseKey>
}): {
	auth: AuthLike
	db: MemoryDB
	validateLicenseKey: (key: string) => Promise<ValidatedLicenseKey>
} => {
	const db: MemoryDB = {
		user: [],
		session: [],
		account: [],
		verification: [],
	}

	const validateLicenseKey =
		options?.validateLicenseKey ??
		(async () => createValidatedLicense({ customerId: "default-customer" }))

	const auth = betterAuth({
		baseURL: BASE_URL,
		secret: "better-auth-secret-that-is-long-enough-for-tests",
		database: memoryAdapter(db),
		rateLimit: {
			enabled: false,
		},
		plugins: [
			polarLicensePlugin({
				isConfigured: () => options?.isConfigured ?? true,
				validateLicenseKey,
			}),
		],
	}) as unknown as AuthLike

	return { auth, db, validateLicenseKey }
}

const signInWithLicenseKey = async (
	auth: AuthLike,
	body: { key: string; rememberMe?: boolean },
): Promise<Response> => {
	const request = new Request(SIGN_IN_LICENSE_PATH, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	})

	return auth.handler(request)
}

const readJson = async (response: Response): Promise<Record<string, any>> =>
	(await response.json()) as Record<string, any>

describe("polar-license-plugin", () => {
	it("creates user/account/session on first valid login", async () => {
		const validateLicenseKey = vi.fn(async () =>
			createValidatedLicense({ customerId: "customer-first" }),
		)
		const { auth, db } = createAuth({ validateLicenseKey })

		const response = await signInWithLicenseKey(auth, {
			key: "  license-key  ",
		})

		expect(response.status).toBe(200)
		const body = await readJson(response)
		expect(typeof body.token).toBe("string")
		expect(body.user.email).toBe("customer@mdit.app")
		expect(validateLicenseKey).toHaveBeenCalledWith("license-key")
		expect(db.user).toHaveLength(1)
		expect(db.account).toHaveLength(1)
		expect(db.session).toHaveLength(1)
	})

	it("reuses the same user for repeated login with same customer id", async () => {
		const validateLicenseKey = vi.fn(async () =>
			createValidatedLicense({ customerId: "customer-repeat" }),
		)
		const { auth, db } = createAuth({ validateLicenseKey })

		const firstResponse = await signInWithLicenseKey(auth, {
			key: "license-key",
		})
		const firstBody = await readJson(firstResponse)

		const secondResponse = await signInWithLicenseKey(auth, {
			key: "license-key",
		})
		const secondBody = await readJson(secondResponse)

		expect(firstResponse.status).toBe(200)
		expect(secondResponse.status).toBe(200)
		expect(secondBody.user.id).toBe(firstBody.user.id)
		expect(db.user).toHaveLength(1)
		expect(db.account).toHaveLength(1)
	})

	it("links license account to existing user with matching email", async () => {
		const license = createValidatedLicense({
			customerId: "customer-link-email",
			customer: {
				email: "existing@mdit.app",
			},
		})

		const { auth, db } = createAuth({
			validateLicenseKey: async () => license,
		})

		const context = await auth.$context
		const existingUser = await context.internalAdapter.createUser({
			email: "existing@mdit.app",
			name: "Existing User",
			emailVerified: true,
		})

		const response = await signInWithLicenseKey(auth, { key: "license-key" })
		const body = await readJson(response)

		expect(response.status).toBe(200)
		expect(body.user.id).toBe(existingUser.id)
		expect(db.user).toHaveLength(1)
		expect(db.account).toHaveLength(1)
		expect((db.account[0] as { userId: string }).userId).toBe(existingUser.id)
	})

	it("returns 401 for invalid license key validation error", async () => {
		const validateLicenseKey = vi.fn(async () => {
			const error = new Error("invalid license") as Error & {
				statusCode: number
			}
			error.statusCode = 404
			throw error
		})

		const { auth, db } = createAuth({ validateLicenseKey })
		const response = await signInWithLicenseKey(auth, { key: "license-key" })
		const body = await readJson(response)

		expect(response.status).toBe(401)
		expect(body.code).toBe("INVALID_LICENSE_KEY")
		expect(db.session).toHaveLength(0)
	})

	it.each([
		401, 403, 429,
	] as const)("returns 502 when polar validation fails with status %s", async (statusCode) => {
		const validateLicenseKey = vi.fn(async () => {
			const error = new Error("polar request failed") as Error & {
				statusCode: number
			}
			error.statusCode = statusCode
			throw error
		})

		const { auth, db } = createAuth({ validateLicenseKey })
		const response = await signInWithLicenseKey(auth, { key: "license-key" })
		const body = await readJson(response)

		expect(response.status).toBe(502)
		expect(body.code).toBe("POLAR_VALIDATION_FAILED")
		expect(db.session).toHaveLength(0)
	})

	it.each([
		"revoked",
		"disabled",
	] as const)("returns 401 when license status is %s", async (status) => {
		const { auth } = createAuth({
			validateLicenseKey: async () => createValidatedLicense({ status }),
		})

		const response = await signInWithLicenseKey(auth, { key: "license-key" })
		const body = await readJson(response)

		expect(response.status).toBe(401)
		expect(body.code).toBe("INVALID_LICENSE_KEY")
	})

	it("returns 503 when polar is not configured", async () => {
		const validateLicenseKey = vi.fn(async () =>
			createValidatedLicense({ customerId: "not-used" }),
		)
		const { auth } = createAuth({
			isConfigured: false,
			validateLicenseKey,
		})

		const response = await signInWithLicenseKey(auth, { key: "license-key" })
		const body = await readJson(response)

		expect(response.status).toBe(503)
		expect(body.code).toBe("POLAR_NOT_CONFIGURED")
		expect(validateLicenseKey).not.toHaveBeenCalled()
	})

	it("returns 502 when polar validation fails unexpectedly", async () => {
		const validateLicenseKey = vi.fn(async () => {
			throw new Error("network unavailable")
		})
		const { auth } = createAuth({ validateLicenseKey })

		const response = await signInWithLicenseKey(auth, { key: "license-key" })
		const body = await readJson(response)

		expect(response.status).toBe(502)
		expect(body.code).toBe("POLAR_VALIDATION_FAILED")
	})
})
