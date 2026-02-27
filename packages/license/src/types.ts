export type LicenseStatus =
	| "valid"
	| "invalid"
	| "validating"
	| "activating"
	| "deactivating"

export type LicenseState = {
	status: LicenseStatus
	hasVerifiedLicense: boolean
	error: string | null
}

export type LicenseActivationResponse = {
	id: string
	license_key_id: string
	label: string
	meta: Record<string, unknown>
	created_at: string
	modified_at: string | null
	license_key: {
		id: string
		organization_id: string
		user_id: string
		benefit_id: string
		key: string
		display_key: string
		status: string
		limit_activations: number | null
		usage: number
		limit_usage: number | null
		validations: number
		last_validated_at: string | null
		expires_at: string | null
	}
}

export type LicenseValidationResponse = {
	id: string
	organization_id: string
	user_id: string
	benefit_id: string
	key: string
	display_key: string
	status: string
	limit_activations: number | null
	usage: number
	limit_usage: number | null
	validations: number
	last_validated_at: string
	expires_at: string | null
	activation?: {
		id: string
		license_key_id: string
		label: string
		meta: Record<string, unknown>
		created_at: string
		modified_at: string | null
	}
}

export type LicenseError = {
	message: string
	code?: string
}

export type LicenseResult<T> =
	| { success: true; data: T }
	| { success: false; error: LicenseError; isValidationError: boolean }
