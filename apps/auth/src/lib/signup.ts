export const SIGN_UP_EMAIL_PATH = "/sign-up/email"

type SignupBody = {
	email?: unknown
	name?: unknown
	[key: string]: unknown
}

export const deriveSignupName = (email: string) => {
	const [localPart] = email.split("@")

	return localPart || email
}

export const withDefaultSignupName = <T extends SignupBody>(body: T): T => {
	if (!body || typeof body !== "object") {
		return body
	}

	if (typeof body.name === "string" && body.name.trim().length > 0) {
		return body
	}

	if (typeof body.email !== "string" || body.email.length === 0) {
		return body
	}

	return {
		...body,
		name: deriveSignupName(body.email),
	}
}
