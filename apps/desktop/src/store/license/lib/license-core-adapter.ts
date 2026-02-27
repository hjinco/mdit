import { deleteAppSecret, getAppSecret, setAppSecret } from "@mdit/credentials"
import {
	createLicenseCore,
	createPolarLicenseApi,
	type LicenseCore,
	type LicenseRuntimePort,
	type LicenseStoragePort,
} from "@mdit/license"
import {
	deletePassword as deletePasswordFromKeyring,
	getPassword as getPasswordFromKeyring,
} from "tauri-plugin-keyring-api"

const LEGACY_LICENSE_SERVICE = "app.mdit.license.lifetime"
const LEGACY_LICENSE_USER = "mdit"
const ACTIVATION_ID_STORAGE_KEY = "license-activation-id"
const POLAR_API_BASE_URL = import.meta.env.VITE_POLAR_API_BASE_URL
const ORGANIZATION_ID = import.meta.env.VITE_POLAR_ORGANIZATION_ID

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

const apiPort = createPolarLicenseApi({
	baseUrl: POLAR_API_BASE_URL ?? "",
	organizationId: ORGANIZATION_ID ?? "",
	fetch: (input, init) => fetch(input, init),
	getClientMeta: () => ({
		platform: globalThis.navigator?.platform ?? null,
		userAgent: globalThis.navigator?.userAgent ?? null,
	}),
})

const runtimePort: LicenseRuntimePort = {
	isConfigured: () => Boolean(POLAR_API_BASE_URL && ORGANIZATION_ID),
}

export const createDesktopLicenseCore = (): LicenseCore => {
	return createLicenseCore({
		storage: storagePort,
		api: apiPort,
		runtime: runtimePort,
	})
}
