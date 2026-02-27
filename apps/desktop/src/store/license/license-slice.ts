import type {
	LicenseActivationResponse,
	LicenseCore,
	LicenseValidationResponse,
} from "@mdit/license"
import type { StateCreator } from "zustand"
import { createDesktopLicenseCore } from "./lib/license-core-adapter"

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
	licenseCore: LicenseCore
}

export const prepareLicenseSlice =
	({
		licenseCore,
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
				const nextState = await licenseCore.checkLicense(get())
				set(nextState)
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
				set({ status: "activating" })
				const nextState = await licenseCore.registerLicenseKey(key)
				set(nextState)
			} catch {
				set({
					status: "invalid",
					hasVerifiedLicense: false,
					error: "Failed to register license key",
				})
			}
		},

		activateLicense: async (key: string) => {
			set({ status: "activating" })
			const result = await licenseCore.activateLicense(key)

			if (!result.data) {
				set(result.state)
				return null
			}

			return result.data
		},

		validateLicense: async (key: string, activationId: string) => {
			set({ status: "validating" })
			const result = await licenseCore.validateLicense(key, activationId)
			set(result.state)
			return result.data
		},

		deactivateLicense: async () => {
			try {
				set({ status: "deactivating", error: null })
				const nextState = await licenseCore.deactivateLicense()
				set(nextState)
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
	licenseCore: createDesktopLicenseCore(),
})
