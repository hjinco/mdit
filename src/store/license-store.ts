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

export const createLicenseStore = ({
  getPassword,
  setPassword,
  deletePassword,
}: {
  getPassword: (service: string, username: string) => Promise<string | null>
  setPassword: (
    service: string,
    username: string,
    password: string
  ) => Promise<void>
  deletePassword: (service: string, username: string) => Promise<void>
}) =>
  create<LicenseStore>((set, get) => ({
    status: 'valid',
    error: null,
    isChecking: false,

    clearLicenseError: () => set({ error: null }),

    checkLicense: async () => {
      try {
        // Prevent concurrent calls
        if (get().status === 'validating') {
          return
        }

        set({ status: 'validating', error: null })

        // If Polar environment variables are not set, assume license is valid
        const polarApiBaseUrl = import.meta.env.VITE_POLAR_API_BASE_URL
        const organizationId = import.meta.env.VITE_POLAR_ORGANIZATION_ID
        if (!polarApiBaseUrl || !organizationId) {
          set({ status: 'valid' })
          return
        }

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

        // Step 4: If both exist, try to validate
        await get().validateLicense(licenseKey, activationId)
      } catch {
        set({
          status: 'invalid',
          error: 'Failed to check license',
        })
      }
    },

    registerLicenseKey: async (key: string) => {
      try {
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
          // validateLicense already handles credential deletion for validation errors
          // and preserves credentials for other errors, so we don't need to delete here
          return
        }
      } catch {
        set({
          status: 'invalid',
          error: 'Failed to register license key',
        })
        return
      }
    },

    activateLicense: async (key: string) => {
      set({ status: 'activating' })
      const result = await activateLicenseKey(key)

      if (!result.success) {
        set({
          status: 'invalid',
          error: result.error.message,
        })
        return null
      }

      localStorage.setItem(ACTIVATION_ID_STORAGE_KEY, result.data.id)
      // Status will be updated by validateLicense or checkLicense
      return result.data
    },

    validateLicense: async (key: string, activationId: string) => {
      set({ status: 'validating' })

      const result = await validateLicenseKey(key, activationId)

      if (!result.success) {
        // Only update status if we're still in validating state (not interrupted)
        // Validation errors: delete stored credentials
        if (result.isValidationError) {
          await deletePassword(LICENSE_SERVICE, LICENSE_USER)
          localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)
          set({
            status: 'invalid',
            error: result.error.message,
          })
          return null
        }

        // Other errors (network/server): assume valid, preserve credentials
        set({ status: 'valid', error: null })
        return null
      }

      set({ status: 'valid' })
      return result.data
    },

    deactivateLicense: async () => {
      try {
        set({ status: 'deactivating', error: null })

        // Retrieve stored license key and activation ID
        const licenseKey = await getPassword(LICENSE_SERVICE, LICENSE_USER)
        const activationId = localStorage.getItem(ACTIVATION_ID_STORAGE_KEY)

        if (!licenseKey || !activationId) {
          set({
            status: 'valid',
            error: 'No license key or activation ID found',
          })
          return
        }

        // Call deactivate API
        const result = await deactivateLicenseKey(licenseKey, activationId)

        if (!result.success) {
          // Validation errors: delete stored credentials
          if (result.isValidationError) {
            await deletePassword(LICENSE_SERVICE, LICENSE_USER)
            localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)
            set({ status: 'invalid', error: result.error.message })
          } else {
            // Other errors (network/server): assume still valid
            set({ status: 'valid', error: result.error.message })
          }
          return
        }

        // On success: clear stored credentials
        await deletePassword(LICENSE_SERVICE, LICENSE_USER)
        localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)
        set({ status: 'invalid' })
      } catch {
        set({ status: 'valid', error: 'Failed to deactivate license' })
      }
    },
  }))

export const useLicenseStore = createLicenseStore({
  getPassword,
  setPassword,
  deletePassword,
})
