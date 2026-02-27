import type {
	LicenseApiPort,
	LicenseRuntimePort,
	LicenseStoragePort,
} from "./ports"
import type {
	LicenseActivationResponse,
	LicenseState,
	LicenseValidationResponse,
} from "./types"

export type LicenseCore = {
	checkLicense: (current: LicenseState) => Promise<LicenseState>
	registerLicenseKey: (key: string) => Promise<LicenseState>
	activateLicense: (
		key: string,
	) => Promise<{ state: LicenseState; data: LicenseActivationResponse | null }>
	validateLicense: (
		key: string,
		activationId: string,
	) => Promise<{ state: LicenseState; data: LicenseValidationResponse | null }>
	deactivateLicense: () => Promise<LicenseState>
}

type CreateLicenseCoreOptions = {
	storage: LicenseStoragePort
	api: LicenseApiPort
	runtime: LicenseRuntimePort
}

const toInvalidState = (error: string | null): LicenseState => ({
	status: "invalid",
	hasVerifiedLicense: false,
	error,
})

const toValidState = (
	hasVerifiedLicense: boolean,
	error: string | null,
): LicenseState => ({
	status: "valid",
	hasVerifiedLicense,
	error,
})

export const createLicenseCore = ({
	storage,
	api,
	runtime,
}: CreateLicenseCoreOptions): LicenseCore => {
	const activateLicense: LicenseCore["activateLicense"] = async (key) => {
		const result = await api.activateLicenseKey(key)

		if (!result.success) {
			return {
				state: toInvalidState(result.error.message),
				data: null,
			}
		}

		storage.setActivationId(result.data.id)

		return {
			state: {
				status: "activating",
				hasVerifiedLicense: false,
				error: null,
			},
			data: result.data,
		}
	}

	const validateLicense: LicenseCore["validateLicense"] = async (
		key,
		activationId,
	) => {
		const result = await api.validateLicenseKey(key, activationId)

		if (!result.success) {
			if (result.isValidationError) {
				await storage.deleteLicenseKey()
				storage.deleteActivationId()
				return {
					state: toInvalidState(result.error.message),
					data: null,
				}
			}

			return {
				state: toValidState(false, null),
				data: null,
			}
		}

		return {
			state: toValidState(true, null),
			data: result.data,
		}
	}

	const checkLicense: LicenseCore["checkLicense"] = async (_current) => {
		if (!runtime.isConfigured()) {
			return toValidState(true, null)
		}

		let licenseKey = await storage.getLicenseKey()
		if (!licenseKey) {
			const legacyLicenseKey = await storage.getLegacyLicenseKey()
			if (legacyLicenseKey) {
				await storage.setLicenseKey(legacyLicenseKey)
				await storage.deleteLegacyLicenseKey()
				licenseKey = legacyLicenseKey
			}
		}

		if (!licenseKey) {
			return toInvalidState(null)
		}

		let activationId = storage.getActivationId()

		if (!activationId) {
			const activationResult = await activateLicense(licenseKey)
			if (!activationResult.data) {
				return activationResult.state
			}
			activationId = activationResult.data.id
		}

		const validationResult = await validateLicense(licenseKey, activationId)
		return validationResult.state
	}

	const registerLicenseKey: LicenseCore["registerLicenseKey"] = async (key) => {
		const activationResult = await activateLicense(key)
		if (!activationResult.data) {
			return activationResult.state
		}

		await storage.setLicenseKey(key)

		const validationResult = await validateLicense(
			key,
			activationResult.data.id,
		)
		return validationResult.state
	}

	const deactivateLicense: LicenseCore["deactivateLicense"] = async () => {
		const licenseKey = await storage.getLicenseKey()
		const activationId = storage.getActivationId()

		if (!licenseKey || !activationId) {
			return toValidState(false, "No license key or activation ID found")
		}

		const result = await api.deactivateLicenseKey(licenseKey, activationId)

		if (!result.success) {
			if (result.isValidationError) {
				await storage.deleteLicenseKey()
				storage.deleteActivationId()
				return toInvalidState(result.error.message)
			}

			return toValidState(false, result.error.message)
		}

		await storage.deleteLicenseKey()
		storage.deleteActivationId()
		return toInvalidState(null)
	}

	return {
		checkLicense,
		registerLicenseKey,
		activateLicense,
		validateLicense,
		deactivateLicense,
	}
}
