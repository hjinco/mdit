import {
  deletePassword,
  getPassword,
  setPassword,
} from 'tauri-plugin-keyring-api'
import { create } from 'zustand'
import {
  activateLicenseKey,
  deactivateLicenseKey,
  type LicenseActivationResponse,
  type LicenseValidationResponse,
  validateLicenseKey,
} from './license/lib/license-api'

const LICENSE_SERVICE = 'app.mdit.license.lifetime'
const LICENSE_USER = 'mdit'
const ACTIVATION_ID_STORAGE_KEY = 'license-activation-id'

type LicenseStore = {
  status: 'valid' | 'invalid' | 'validating' | 'activating' | 'deactivating'
  error: string | null
  clearLicenseError: () => void
  checkLicense: () => Promise<void>
  registerLicenseKey: (key: string) => Promise<void>
  activateLicense: (key: string) => Promise<LicenseActivationResponse | null>
  validateLicense: (
    key: string,
    activationId: string
  ) => Promise<LicenseValidationResponse | null>
  deactivateLicense: () => Promise<void>
}

export const useLicenseStore = create<LicenseStore>((set, get) => ({
  status: 'valid',
  error: null,

  clearLicenseError: () => set({ error: null }),

  checkLicense: async () => {
    set({ status: 'validating', error: null })

    // If Polar environment variables are not set, assume license is valid
    const polarApiBaseUrl = import.meta.env.VITE_POLAR_API_BASE_URL
    const organizationId = import.meta.env.VITE_POLAR_ORGANIZATION_ID
    if (!polarApiBaseUrl || !organizationId) {
      set({ status: 'valid' })
      return
    }

    try {
      // Step 1: Retrieve stored license key and activation ID
      const licenseKey = await getPassword(LICENSE_SERVICE, LICENSE_USER)
      let activationId = localStorage.getItem(ACTIVATION_ID_STORAGE_KEY)

      if (!licenseKey) {
        // Step 2: If license key is missing, set as unauthenticated
        set({ status: 'invalid' })
        return
      }

      if (!activationId) {
        // Step 3: If license key exists but activation ID is missing, try to activate
        const activationResult = await get().activateLicense(licenseKey)
        if (!activationResult) {
          return
        }
        activationId = activationResult.id
      }

      // Step 4: If both exist, try to validate with retry
      await get().validateLicense(licenseKey, activationId)
    } catch (_e) {
      set({
        status: 'invalid',
        error: 'Failed to check license',
      })
    }
  },

  registerLicenseKey: async (key: string) => {
    const activationResult = await get().activateLicense(key)
    if (!activationResult) {
      return
    }
    await setPassword(LICENSE_SERVICE, LICENSE_USER, key)
    const validationResult = await get().validateLicense(
      key,
      activationResult.id
    )
    if (!validationResult) {
      await deletePassword(LICENSE_SERVICE, LICENSE_USER)
      localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)
      return
    }
  },

  activateLicense: async (key: string) => {
    set({ status: 'activating' })
    try {
      const activationResult = await activateLicenseKey(key)
      localStorage.setItem(ACTIVATION_ID_STORAGE_KEY, activationResult.id)
      return activationResult
    } catch (error) {
      await deletePassword(LICENSE_SERVICE, LICENSE_USER)
      set({
        status: 'invalid',
        error:
          error instanceof Error ? error.message : 'Failed to activate license',
      })
      return null
    }
  },

  validateLicense: async (key: string, activationId: string) => {
    set({ status: 'validating' })

    try {
      const validationResult = await validateLicenseKey(key, activationId)
      set({ status: 'valid' })
      return validationResult
    } catch (error) {
      // TODO: Improve error handling to distinguish between network errors and invalid licenses.
      // Currently, a temporary network or server error during validation will wipe saved
      // credentials, forcing users to re-enter and reactivate their license once connectivity
      // returns. Consider implementing retry logic or preserving credentials for network errors.
      await deletePassword(LICENSE_SERVICE, LICENSE_USER)
      localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)
      set({
        status: 'invalid',
        error:
          error instanceof Error ? error.message : 'Failed to validate license',
      })
      return null
    }
  },

  deactivateLicense: async () => {
    set({ status: 'deactivating', error: null })

    try {
      // Retrieve stored license key and activation ID
      const licenseKey = await getPassword(LICENSE_SERVICE, LICENSE_USER)
      const activationId = localStorage.getItem(ACTIVATION_ID_STORAGE_KEY)

      if (!licenseKey || !activationId) {
        throw new Error('No license key or activation ID found')
      }

      // Call deactivate API
      await deactivateLicenseKey(licenseKey, activationId)

      // On success: clear stored credentials
      await deletePassword(LICENSE_SERVICE, LICENSE_USER)
      localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)
      set({ status: 'invalid' })
    } catch (error) {
      set({
        status: 'valid',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to deactivate license',
      })
    }
  },
}))
