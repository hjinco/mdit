import type {
	LicenseActivationResponse,
	LicenseResult,
	LicenseValidationResponse,
} from "@mdit/license"

export type {
	LicenseActivationResponse,
	LicenseError,
	LicenseResult,
	LicenseValidationResponse,
} from "@mdit/license"

const POLAR_API_BASE_URL = import.meta.env.VITE_POLAR_API_BASE_URL
const ORGANIZATION_ID = import.meta.env.VITE_POLAR_ORGANIZATION_ID

export async function activateLicenseKey(
	key: string,
): Promise<LicenseResult<LicenseActivationResponse>> {
	try {
		const response = await fetch(
			`${POLAR_API_BASE_URL}/v1/customer-portal/license-keys/activate`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					key: key.trim(),
					organization_id: ORGANIZATION_ID,
					label: `Mdit - ${new Date().toISOString()}`,
					meta: {
						platform: navigator.platform,
						user_agent: navigator.userAgent,
					},
				}),
			},
		)

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}))
			const isValidationError = response.status >= 400 && response.status < 500
			return {
				success: false,
				error: {
					message:
						errorData.detail ||
						errorData.message ||
						`Activation failed: ${response.status}`,
					code: errorData.code,
				},
				isValidationError,
			}
		}

		const data = await response.json()
		return { success: true, data }
	} catch (error) {
		const isValidationError = false // Network/other errors are not validation errors
		if (error instanceof Error) {
			return {
				success: false,
				error: {
					message: error.message,
				},
				isValidationError,
			}
		}
		return {
			success: false,
			error: {
				message: "Failed to activate license key",
			},
			isValidationError,
		}
	}
}

export async function validateLicenseKey(
	key: string,
	activationId: string,
): Promise<LicenseResult<LicenseValidationResponse>> {
	try {
		const response = await fetch(
			`${POLAR_API_BASE_URL}/v1/customer-portal/license-keys/validate`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					key: key.trim(),
					organization_id: ORGANIZATION_ID,
					activation_id: activationId,
				}),
			},
		)

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}))
			const isValidationError = response.status >= 400 && response.status < 500
			return {
				success: false,
				error: {
					message:
						errorData.detail ||
						errorData.message ||
						`Validation failed: ${response.status}`,
					code: errorData.code,
				},
				isValidationError,
			}
		}

		const data = await response.json()
		return { success: true, data }
	} catch (error) {
		const isValidationError = false // Network/other errors are not validation errors
		if (error instanceof Error) {
			return {
				success: false,
				error: {
					message: error.message,
				},
				isValidationError,
			}
		}
		return {
			success: false,
			error: {
				message: "Failed to validate license key",
			},
			isValidationError,
		}
	}
}

export async function deactivateLicenseKey(
	key: string,
	activationId: string,
): Promise<LicenseResult<void>> {
	try {
		const response = await fetch(
			`${POLAR_API_BASE_URL}/v1/customer-portal/license-keys/deactivate`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					key: key.trim(),
					organization_id: ORGANIZATION_ID,
					activation_id: activationId,
				}),
			},
		)

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}))
			const isValidationError = response.status >= 400 && response.status < 500
			return {
				success: false,
				error: {
					message:
						errorData.detail ||
						errorData.message ||
						`Deactivation failed: ${response.status}`,
					code: errorData.code,
				},
				isValidationError,
			}
		}

		return { success: true, data: undefined }
	} catch (error) {
		const isValidationError = false // Network/other errors are not validation errors
		if (error instanceof Error) {
			return {
				success: false,
				error: {
					message: error.message,
				},
				isValidationError,
			}
		}
		return {
			success: false,
			error: {
				message: "Failed to deactivate license key",
			},
			isValidationError,
		}
	}
}
