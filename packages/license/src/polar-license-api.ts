import type { LicenseApiPort } from "./ports"
import type {
	LicenseActivationResponse,
	LicenseError,
	LicenseResult,
	LicenseValidationResponse,
} from "./types"

type PolarFetchResponse = {
	ok: boolean
	status: number
	json: () => Promise<unknown>
}

type PolarFetch = (
	input: string,
	init: {
		method: "POST"
		headers: Record<string, string>
		body: string
	},
) => Promise<PolarFetchResponse>

type PolarClientMeta = {
	platform?: string | null
	userAgent?: string | null
}

export type CreatePolarLicenseApiOptions = {
	baseUrl: string
	organizationId: string
	fetch: PolarFetch
	getClientMeta?: () => PolarClientMeta
}

const isValidationErrorStatus = (status: number) =>
	status >= 400 && status < 500

const toLicenseError = async (
	response: PolarFetchResponse,
	fallbackMessage: string,
): Promise<LicenseError> => {
	const errorData = (await response.json().catch(() => ({}))) as {
		detail?: string
		message?: string
		code?: string
	}

	return {
		message: errorData.detail || errorData.message || fallbackMessage,
		code: errorData.code,
	}
}

const toNetworkError = (
	error: unknown,
	defaultMessage: string,
): LicenseResult<never> => {
	if (error instanceof Error) {
		return {
			success: false,
			error: { message: error.message },
			isValidationError: false,
		}
	}

	return {
		success: false,
		error: { message: defaultMessage },
		isValidationError: false,
	}
}

export const createPolarLicenseApi = ({
	baseUrl,
	organizationId,
	fetch,
	getClientMeta,
}: CreatePolarLicenseApiOptions): LicenseApiPort => {
	const activateLicenseKey: LicenseApiPort["activateLicenseKey"] = async (
		key,
	) => {
		try {
			const clientMeta = getClientMeta?.()
			const meta: Record<string, string> = {}
			if (clientMeta?.platform) {
				meta.platform = clientMeta.platform
			}
			if (clientMeta?.userAgent) {
				meta.user_agent = clientMeta.userAgent
			}

			const response = await fetch(
				`${baseUrl}/v1/customer-portal/license-keys/activate`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						key: key.trim(),
						organization_id: organizationId,
						label: `Mdit - ${new Date().toISOString()}`,
						meta,
					}),
				},
			)

			if (!response.ok) {
				return {
					success: false,
					error: await toLicenseError(
						response,
						`Activation failed: ${response.status}`,
					),
					isValidationError: isValidationErrorStatus(response.status),
				}
			}

			const data = await response.json()
			return {
				success: true,
				data: data as LicenseActivationResponse,
			}
		} catch (error) {
			return toNetworkError(error, "Failed to activate license key")
		}
	}

	const validateLicenseKey: LicenseApiPort["validateLicenseKey"] = async (
		key,
		activationId,
	) => {
		try {
			const response = await fetch(
				`${baseUrl}/v1/customer-portal/license-keys/validate`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						key: key.trim(),
						organization_id: organizationId,
						activation_id: activationId,
					}),
				},
			)

			if (!response.ok) {
				return {
					success: false,
					error: await toLicenseError(
						response,
						`Validation failed: ${response.status}`,
					),
					isValidationError: isValidationErrorStatus(response.status),
				}
			}

			const data = await response.json()
			return {
				success: true,
				data: data as LicenseValidationResponse,
			}
		} catch (error) {
			return toNetworkError(error, "Failed to validate license key")
		}
	}

	const deactivateLicenseKey: LicenseApiPort["deactivateLicenseKey"] = async (
		key,
		activationId,
	) => {
		try {
			const response = await fetch(
				`${baseUrl}/v1/customer-portal/license-keys/deactivate`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						key: key.trim(),
						organization_id: organizationId,
						activation_id: activationId,
					}),
				},
			)

			if (!response.ok) {
				return {
					success: false,
					error: await toLicenseError(
						response,
						`Deactivation failed: ${response.status}`,
					),
					isValidationError: isValidationErrorStatus(response.status),
				}
			}

			return { success: true, data: undefined }
		} catch (error) {
			return toNetworkError(error, "Failed to deactivate license key")
		}
	}

	return {
		activateLicenseKey,
		validateLicenseKey,
		deactivateLicenseKey,
	}
}
