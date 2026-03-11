import type { MiddlewareHandler } from "hono"

export type VerifiedAuthSession = {
	userId: string
	sessionId?: string
}

type AuthVerificationService = {
	verifySessionFromAuthorization(
		authorizationHeader: string | null,
	): Promise<VerifiedAuthSession | null>
}

type AuthVerificationResult =
	| {
			ok: true
			session: VerifiedAuthSession
	  }
	| {
			ok: false
			status: 401 | 502
			body: {
				code: "UNAUTHORIZED" | "AUTH_SERVICE_UNAVAILABLE"
			}
	  }

type AuthMiddlewareEnv = {
	Bindings: Env
	Variables: {
		session: VerifiedAuthSession
	}
}

const verifyAuthorizationSession = async (
	authService: AuthVerificationService,
	authorizationHeader: string | null,
): Promise<AuthVerificationResult> => {
	if (!authorizationHeader || authorizationHeader.trim().length === 0) {
		return {
			ok: false,
			status: 401,
			body: { code: "UNAUTHORIZED" },
		}
	}

	try {
		const session =
			await authService.verifySessionFromAuthorization(authorizationHeader)
		if (!session) {
			return {
				ok: false,
				status: 401,
				body: { code: "UNAUTHORIZED" },
			}
		}

		return {
			ok: true,
			session,
		}
	} catch {
		return {
			ok: false,
			status: 502,
			body: { code: "AUTH_SERVICE_UNAVAILABLE" },
		}
	}
}

export const authMiddleware: MiddlewareHandler<AuthMiddlewareEnv> = async (
	c,
	next,
) => {
	const result = await verifyAuthorizationSession(
		c.env.AUTH_SERVICE as unknown as AuthVerificationService,
		c.req.header("authorization") ?? null,
	)
	if (!result.ok) {
		return c.json(result.body, result.status)
	}

	c.set("session", result.session)
	await next()
}
