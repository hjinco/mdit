export type VerifiedAuthSession = {
	userId: string
	sessionId?: string
}

type SessionLookupResult = {
	session: {
		id: string
		userId: string
	}
} | null

export type AuthSessionReader = {
	api: {
		getSession(input: {
			headers: Headers
			query?: {
				disableCookieCache?: boolean
				disableRefresh?: boolean
			}
		}): Promise<SessionLookupResult>
	}
}

export const verifyAuthSessionFromHeaders = async (
	auth: AuthSessionReader,
	headers: Headers,
): Promise<VerifiedAuthSession | null> => {
	const authorizationHeader = headers.get("authorization")
	if (!authorizationHeader || authorizationHeader.trim().length === 0) {
		return null
	}

	const result = await auth.api.getSession({
		headers,
		query: {
			disableCookieCache: true,
			disableRefresh: true,
		},
	})

	if (!result) {
		return null
	}

	return {
		userId: result.session.userId,
		sessionId: result.session.id,
	}
}

export const verifyAuthSessionFromAuthorization = (
	auth: AuthSessionReader,
	authorizationHeader: string | null,
): Promise<VerifiedAuthSession | null> => {
	const headers = new Headers()
	if (authorizationHeader) {
		headers.set("authorization", authorizationHeader)
	}
	return verifyAuthSessionFromHeaders(auth, headers)
}
