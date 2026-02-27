import { deleteAppSecret, getAppSecret, setAppSecret } from "@mdit/credentials"
import {
	createLicenseCore,
	type LicenseApiPort,
	type LicenseCore,
	type LicenseRuntimePort,
	type LicenseStoragePort,
} from "@mdit/license"
import {
	deletePassword as deletePasswordFromKeyring,
	getPassword as getPasswordFromKeyring,
} from "tauri-plugin-keyring-api"
import {
	activateLicenseKey,
	deactivateLicenseKey,
	validateLicenseKey,
} from "./license-api"

const LEGACY_LICENSE_SERVICE = "app.mdit.license.lifetime"
const LEGACY_LICENSE_USER = "mdit"
const ACTIVATION_ID_STORAGE_KEY = "license-activation-id"

const storagePort: LicenseStoragePort = {
	getLicenseKey: async () => getAppSecret("license_key"),
	setLicenseKey: async (key) => setAppSecret("license_key", key),
	deleteLicenseKey: async () => deleteAppSecret("license_key"),
	getLegacyLicenseKey: async () =>
		getPasswordFromKeyring(LEGACY_LICENSE_SERVICE, LEGACY_LICENSE_USER),
	deleteLegacyLicenseKey: async () =>
		deletePasswordFromKeyring(LEGACY_LICENSE_SERVICE, LEGACY_LICENSE_USER),
	getActivationId: () => localStorage.getItem(ACTIVATION_ID_STORAGE_KEY),
	setActivationId: (id) => localStorage.setItem(ACTIVATION_ID_STORAGE_KEY, id),
	deleteActivationId: () => localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY),
}

const apiPort: LicenseApiPort = {
	activateLicenseKey,
	validateLicenseKey,
	deactivateLicenseKey,
}

const runtimePort: LicenseRuntimePort = {
	isConfigured: () => {
		const polarApiBaseUrl = import.meta.env.VITE_POLAR_API_BASE_URL
		const organizationId = import.meta.env.VITE_POLAR_ORGANIZATION_ID
		return Boolean(polarApiBaseUrl && organizationId)
	},
}

export const createDesktopLicenseCore = (): LicenseCore => {
	return createLicenseCore({
		storage: storagePort,
		api: apiPort,
		runtime: runtimePort,
	})
}
