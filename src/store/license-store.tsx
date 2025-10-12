import { create } from 'zustand'
import {
  activateLicenseKey,
  validateLicenseKey,
} from '@/components/license/lib/license-api'

const LICENSE_KEY_STORAGE_KEY = 'license-key'
const ACTIVATION_ID_STORAGE_KEY = 'license-activation-id'
const FIRST_INSTALL_KEY = 'first-install-timestamp'
const TRIAL_DAYS = 7

type LicenseStatus = {
  isInTrial: boolean
  daysRemaining: number
  hasLicense: boolean
}

type LicenseStore = {
  isLicenseDialogOpen: boolean
  isValidating: boolean
  error: string | null
  licenseStatus: LicenseStatus
  openLicenseDialog: () => void
  closeLicenseDialog: () => void
  updateLicenseStatus: () => void
  clearLicenseError: () => void
  checkLicenseAndTrial: () => Promise<void>
  activateLicense: (key: string) => Promise<void>
}

export function getTrialInfo(): LicenseStatus {
  const firstInstallTimestamp = localStorage.getItem(FIRST_INSTALL_KEY)
  const hasLicense = Boolean(
    localStorage.getItem(LICENSE_KEY_STORAGE_KEY) &&
      localStorage.getItem(ACTIVATION_ID_STORAGE_KEY)
  )

  if (hasLicense) {
    return { isInTrial: false, daysRemaining: 0, hasLicense: true }
  }

  if (!firstInstallTimestamp) {
    return { isInTrial: true, daysRemaining: TRIAL_DAYS, hasLicense: false }
  }

  const installTime = Number.parseInt(firstInstallTimestamp, 10)
  const now = Date.now()
  const daysPassed = (now - installTime) / (1000 * 60 * 60 * 24)
  const daysRemaining = Math.max(0, Math.ceil(TRIAL_DAYS - daysPassed))

  return {
    isInTrial: daysRemaining > 0,
    daysRemaining,
    hasLicense: false,
  }
}

export const useLicenseStore = create<LicenseStore>((set, get) => ({
  isLicenseDialogOpen: false,
  isValidating: false,
  error: null,
  licenseStatus: getTrialInfo(),

  openLicenseDialog: () => set({ isLicenseDialogOpen: true }),

  closeLicenseDialog: () => set({ isLicenseDialogOpen: false }),

  updateLicenseStatus: () => set({ licenseStatus: getTrialInfo() }),

  clearLicenseError: () => set({ error: null }),

  checkLicenseAndTrial: async () => {
    set({ isValidating: true, error: null })

    try {
      const storedKey = localStorage.getItem(LICENSE_KEY_STORAGE_KEY)
      const storedActivationId = localStorage.getItem(ACTIVATION_ID_STORAGE_KEY)

      // Check if license exists
      if (storedKey && storedActivationId) {
        try {
          const validationResult = await validateLicenseKey(
            storedKey,
            storedActivationId
          )

          // Check if license is still valid
          if (validationResult.status !== 'granted') {
            throw new Error('License is no longer active')
          }

          // Check expiration
          const now = new Date()
          const expiresAt = validationResult.expires_at
            ? new Date(validationResult.expires_at)
            : null

          if (expiresAt && expiresAt < now) {
            set({
              error: 'License has expired',
              isValidating: false,
              licenseStatus: getTrialInfo(),
            })
            get().openLicenseDialog()
            return
          }

          // License is valid
          set({
            isValidating: false,
            licenseStatus: {
              isInTrial: false,
              daysRemaining: 0,
              hasLicense: true,
            },
          })
          return
        } catch (validationError) {
          // Validation failed, clear stored data
          localStorage.removeItem(LICENSE_KEY_STORAGE_KEY)
          localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)

          set({
            error:
              validationError instanceof Error
                ? validationError.message
                : 'License validation failed',
          })
        }
      }

      // No valid license, check trial period
      const firstInstallTimestamp = localStorage.getItem(FIRST_INSTALL_KEY)

      if (!firstInstallTimestamp) {
        // First time user, set install timestamp
        const now = Date.now().toString()
        localStorage.setItem(FIRST_INSTALL_KEY, now)
        set({
          isValidating: false,
          licenseStatus: {
            isInTrial: true,
            daysRemaining: TRIAL_DAYS,
            hasLicense: false,
          },
        })
        return
      }

      // Check if trial has expired
      const installTime = Number.parseInt(firstInstallTimestamp, 10)
      const now = Date.now()
      const daysPassed = (now - installTime) / (1000 * 60 * 60 * 24)

      if (daysPassed < TRIAL_DAYS) {
        // Still in trial period
        const daysRemaining = Math.max(0, Math.ceil(TRIAL_DAYS - daysPassed))
        set({
          isValidating: false,
          licenseStatus: { isInTrial: true, daysRemaining, hasLicense: false },
        })
      } else {
        // Trial expired, open dialog
        set({
          isValidating: false,
          licenseStatus: {
            isInTrial: false,
            daysRemaining: 0,
            hasLicense: false,
          },
        })
        get().openLicenseDialog()
      }
    } catch (error) {
      set({
        isValidating: false,
        error:
          error instanceof Error ? error.message : 'Failed to check license',
      })
    }
  },

  activateLicense: async (key: string) => {
    const trimmedKey = key.trim()

    if (!trimmedKey) {
      set({ error: 'Please enter a license key' })
      throw new Error('Please enter a license key')
    }

    set({ isValidating: true, error: null })

    try {
      // Step 1: Activate the license key
      const activationResult = await activateLicenseKey(trimmedKey)

      // Step 2: Validate the activated license
      const validationResult = await validateLicenseKey(
        trimmedKey,
        activationResult.id
      )

      // Check if license is granted
      if (validationResult.status !== 'granted') {
        throw new Error('License key is not active')
      }

      // Check expiration
      const now = new Date()
      const expiresAt = validationResult.expires_at
        ? new Date(validationResult.expires_at)
        : null

      if (expiresAt && expiresAt < now) {
        set({ error: 'License has expired', isValidating: false })
        throw new Error('License has expired')
      }

      // Store license data
      localStorage.setItem(LICENSE_KEY_STORAGE_KEY, trimmedKey)
      localStorage.setItem(ACTIVATION_ID_STORAGE_KEY, activationResult.id)

      // Update status
      set({
        isValidating: false,
        error: null,
        licenseStatus: { isInTrial: false, daysRemaining: 0, hasLicense: true },
        isLicenseDialogOpen: false,
      })
    } catch (activationError) {
      const errorMessage =
        activationError instanceof Error
          ? activationError.message
          : 'License activation failed'
      set({ error: errorMessage, isValidating: false })
      throw new Error(errorMessage)
    }
  },
}))
