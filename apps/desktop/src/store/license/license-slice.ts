import { deleteAppSecret, getAppSecret, setAppSecret } from "@mdit/credentials"
import {
	deletePassword as deletePasswordFromKeyring,
	getPassword as getPasswordFromKeyring,
} from "tauri-plugin-keyring-api"
import type { StateCreator } from "zustand"
import {
	activateLicenseKey,
	deactivateLicenseKey,
	type LicenseActivationResponse,
	type LicenseValidationResponse,
	validateLicenseKey,
} from "./lib/license-api"

const LEGACY_LICENSE_SERVICE = "app.mdit.license.lifetime"
const LEGACY_LICENSE_USER = "mdit"
const ACTIVATION_ID_STORAGE_KEY = "license-activation-id"

export type LicenseSlice = {
	status: "valid" | "invalid" | "validating" | "activating" | "deactivating"
	hasVerifiedLicense: boolean
	error: string | null
	clearLicenseError: () => void
	checkLicense: () => Promise<void>
	registerLicenseKey: (key: string) => Promise<void>
	activateLicense: (key: string) => Promise<LicenseActivationResponse | null>
	validateLicense: (
		key: string,
		activationId: string,
	) => Promise<LicenseValidationResponse | null>
	deactivateLicense: () => Promise<void>
}

type LicenseSliceDependencies = {
	getLicenseKey: () => Promise<string | null>
	setLicenseKey: (key: string) => Promise<void>
	deleteLicenseKey: () => Promise<void>
	getLegacyLicenseKey: () => Promise<string | null>
	deleteLegacyLicenseKey: () => Promise<void>
	activateLicenseKey: typeof activateLicenseKey
	validateLicenseKey: typeof validateLicenseKey
	deactivateLicenseKey: typeof deactivateLicenseKey
}

export const prepareLicenseSlice =
	({
		getLicenseKey,
		setLicenseKey,
		deleteLicenseKey,
		getLegacyLicenseKey,
		deleteLegacyLicenseKey,
		activateLicenseKey,
		validateLicenseKey,
		deactivateLicenseKey,
	}: LicenseSliceDependencies): StateCreator<
		LicenseSlice,
		[],
		[],
		LicenseSlice
	> =>
	(set, get) => ({
		status: "valid",
		hasVerifiedLicense: false,
		error: null,

		clearLicenseError: () => set({ error: null }),

		checkLicense: async () => {
			try {
				if (get().status === "validating") {
					return
				}

				set({ status: "validating", error: null })

				const polarApiBaseUrl = import.meta.env.VITE_POLAR_API_BASE_URL
				const organizationId = import.meta.env.VITE_POLAR_ORGANIZATION_ID
				if (!polarApiBaseUrl || !organizationId) {
					set({ status: "valid", hasVerifiedLicense: true })
					return
				}

				let licenseKey = await getLicenseKey()
				if (!licenseKey) {
					const legacyLicenseKey = await getLegacyLicenseKey()
					if (legacyLicenseKey) {
						await setLicenseKey(legacyLicenseKey)
						await deleteLegacyLicenseKey()
						licenseKey = legacyLicenseKey
					}
				}
				let activationId = localStorage.getItem(ACTIVATION_ID_STORAGE_KEY)

				if (!licenseKey) {
					set({ status: "invalid", hasVerifiedLicense: false })
					return
				}

				if (!activationId) {
					const activationResult = await get().activateLicense(licenseKey)
					if (!activationResult) {
						return
					}
					activationId = activationResult.id
				}

				await get().validateLicense(licenseKey, activationId)
			} catch {
				set({
					status: "invalid",
					hasVerifiedLicense: false,
					error: "Failed to check license",
				})
			}
		},

		registerLicenseKey: async (key: string) => {
			try {
				const activationResult = await get().activateLicense(key)
				if (!activationResult) {
					return
				}
				await setLicenseKey(key)
				const validationResult = await get().validateLicense(
					key,
					activationResult.id,
				)
				if (!validationResult) {
					return
				}
			} catch {
				set({
					status: "invalid",
					hasVerifiedLicense: false,
					error: "Failed to register license key",
				})
				return
			}
		},

		activateLicense: async (key: string) => {
			set({ status: "activating" })
			const result = await activateLicenseKey(key)

			if (!result.success) {
				set({
					status: "invalid",
					hasVerifiedLicense: false,
					error: result.error.message,
				})
				return null
			}

			localStorage.setItem(ACTIVATION_ID_STORAGE_KEY, result.data.id)
			return result.data
		},

		validateLicense: async (key: string, activationId: string) => {
			set({ status: "validating" })

			const result = await validateLicenseKey(key, activationId)

			if (!result.success) {
				if (result.isValidationError) {
					await deleteLicenseKey()
					localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)
					set({
						status: "invalid",
						hasVerifiedLicense: false,
						error: result.error.message,
					})
					return null
				}

				set({ status: "valid", hasVerifiedLicense: false, error: null })
				return null
			}

			set({ status: "valid", hasVerifiedLicense: true })
			return result.data
		},

		deactivateLicense: async () => {
			try {
				set({ status: "deactivating", error: null })

				const licenseKey = await getLicenseKey()
				const activationId = localStorage.getItem(ACTIVATION_ID_STORAGE_KEY)

				if (!licenseKey || !activationId) {
					set({
						status: "valid",
						hasVerifiedLicense: false,
						error: "No license key or activation ID found",
					})
					return
				}

				const result = await deactivateLicenseKey(licenseKey, activationId)

				if (!result.success) {
					if (result.isValidationError) {
						await deleteLicenseKey()
						localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)
						set({
							status: "invalid",
							hasVerifiedLicense: false,
							error: result.error.message,
						})
					} else {
						set({
							status: "valid",
							hasVerifiedLicense: false,
							error: result.error.message,
						})
					}
					return
				}

				await deleteLicenseKey()
				localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)
				set({ status: "invalid", hasVerifiedLicense: false })
			} catch {
				set({
					status: "valid",
					hasVerifiedLicense: false,
					error: "Failed to deactivate license",
				})
			}
		},
	})

export const createLicenseSlice = prepareLicenseSlice({
	getLicenseKey: async () => getAppSecret("license_key"),
	setLicenseKey: async (key: string) => setAppSecret("license_key", key),
	deleteLicenseKey: async () => deleteAppSecret("license_key"),
	getLegacyLicenseKey: async () =>
		getPasswordFromKeyring(LEGACY_LICENSE_SERVICE, LEGACY_LICENSE_USER),
	deleteLegacyLicenseKey: async () =>
		deletePasswordFromKeyring(LEGACY_LICENSE_SERVICE, LEGACY_LICENSE_USER),
	activateLicenseKey,
	validateLicenseKey,
	deactivateLicenseKey,
})
