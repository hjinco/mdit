import type {
	LicenseActivationResponse,
	LicenseResult,
	LicenseValidationResponse,
} from "./types"

export type LicenseStoragePort = {
	getLicenseKey: () => Promise<string | null>
	setLicenseKey: (key: string) => Promise<void>
	deleteLicenseKey: () => Promise<void>
	getLegacyLicenseKey: () => Promise<string | null>
	deleteLegacyLicenseKey: () => Promise<void>
	getActivationId: () => string | null
	setActivationId: (id: string) => void
	deleteActivationId: () => void
}

export type LicenseApiPort = {
	activateLicenseKey: (
		key: string,
	) => Promise<LicenseResult<LicenseActivationResponse>>
	validateLicenseKey: (
		key: string,
		activationId: string,
	) => Promise<LicenseResult<LicenseValidationResponse>>
	deactivateLicenseKey: (
		key: string,
		activationId: string,
	) => Promise<LicenseResult<void>>
}

export type LicenseRuntimePort = {
	isConfigured: () => boolean
}
