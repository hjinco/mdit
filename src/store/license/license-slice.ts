import {
  deletePassword as deletePasswordFromKeyring,
  getPassword as getPasswordFromKeyring,
  setPassword as setPasswordInKeyring,
} from 'tauri-plugin-keyring-api'
import type { StateCreator } from 'zustand'
import {
  activateLicenseKey,
  deactivateLicenseKey,
  type LicenseActivationResponse,
  type LicenseValidationResponse,
  validateLicenseKey,
} from './lib/license-api'

const LICENSE_SERVICE = 'app.mdit.license.lifetime'
const LICENSE_USER = 'mdit'
const ACTIVATION_ID_STORAGE_KEY = 'license-activation-id'

export type LicenseSlice = {
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

type LicenseSliceDependencies = {
  getPassword: (service: string, username: string) => Promise<string | null>
  setPassword: (
    service: string,
    username: string,
    password: string
  ) => Promise<void>
  deletePassword: (service: string, username: string) => Promise<void>
  activateLicenseKey: typeof activateLicenseKey
  validateLicenseKey: typeof validateLicenseKey
  deactivateLicenseKey: typeof deactivateLicenseKey
}

export const prepareLicenseSlice =
  ({
    getPassword,
    setPassword,
    deletePassword,
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
    status: 'valid',
    error: null,

    clearLicenseError: () => set({ error: null }),

    checkLicense: async () => {
      try {
        if (get().status === 'validating') {
          return
        }

        set({ status: 'validating', error: null })

        const polarApiBaseUrl = import.meta.env.VITE_POLAR_API_BASE_URL
        const organizationId = import.meta.env.VITE_POLAR_ORGANIZATION_ID
        if (!polarApiBaseUrl || !organizationId) {
          set({ status: 'valid' })
          return
        }

        const licenseKey = await getPassword(LICENSE_SERVICE, LICENSE_USER)
        let activationId = localStorage.getItem(ACTIVATION_ID_STORAGE_KEY)

        if (!licenseKey) {
          set({ status: 'invalid' })
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
      return result.data
    },

    validateLicense: async (key: string, activationId: string) => {
      set({ status: 'validating' })

      const result = await validateLicenseKey(key, activationId)

      if (!result.success) {
        if (result.isValidationError) {
          await deletePassword(LICENSE_SERVICE, LICENSE_USER)
          localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)
          set({
            status: 'invalid',
            error: result.error.message,
          })
          return null
        }

        set({ status: 'valid', error: null })
        return null
      }

      set({ status: 'valid' })
      return result.data
    },

    deactivateLicense: async () => {
      try {
        set({ status: 'deactivating', error: null })

        const licenseKey = await getPassword(LICENSE_SERVICE, LICENSE_USER)
        const activationId = localStorage.getItem(ACTIVATION_ID_STORAGE_KEY)

        if (!licenseKey || !activationId) {
          set({
            status: 'valid',
            error: 'No license key or activation ID found',
          })
          return
        }

        const result = await deactivateLicenseKey(licenseKey, activationId)

        if (!result.success) {
          if (result.isValidationError) {
            await deletePassword(LICENSE_SERVICE, LICENSE_USER)
            localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)
            set({ status: 'invalid', error: result.error.message })
          } else {
            set({ status: 'valid', error: result.error.message })
          }
          return
        }

        await deletePassword(LICENSE_SERVICE, LICENSE_USER)
        localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)
        set({ status: 'invalid' })
      } catch {
        set({ status: 'valid', error: 'Failed to deactivate license' })
      }
    },
  })

export const createLicenseSlice = prepareLicenseSlice({
  getPassword: getPasswordFromKeyring,
  setPassword: setPasswordInKeyring,
  deletePassword: deletePasswordFromKeyring,
  activateLicenseKey,
  validateLicenseKey,
  deactivateLicenseKey,
})
