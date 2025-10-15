import { getPassword, setPassword } from 'tauri-plugin-keyring-api'
import { create } from 'zustand'
import { activateLicenseKey } from '@/components/license/lib/license-api'

const LICENSE_SERVICE_NAME = 'mdit'
const LICENSE_KEY_ACCOUNT = 'license-key'
const ACTIVATION_ID_ACCOUNT = 'license-activation-id'
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
      let storedKey: string | null = null
      let storedActivationId: string | null = null

      try {
        const [keyFromKeychain, activationIdFromKeychain] = await Promise.all([
          getPassword(LICENSE_KEY_ACCOUNT, LICENSE_SERVICE_NAME),
          getPassword(ACTIVATION_ID_ACCOUNT, LICENSE_SERVICE_NAME),
        ])
        storedKey = keyFromKeychain
        storedActivationId = activationIdFromKeychain
      } catch (storageError) {
        console.error(
          'Failed to load license credentials from keychain',
          storageError
        )
        storedKey = null
        storedActivationId = null
      }

      if (storedKey && storedActivationId) {
        set({
          isValidating: false,
          error: null,
          licenseStatus: {
            isInTrial: false,
            daysRemaining: 0,
            hasLicense: true,
          },
        })
        return
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

      try {
        await setPassword(LICENSE_KEY_ACCOUNT, LICENSE_SERVICE_NAME, trimmedKey)
        await setPassword(
          ACTIVATION_ID_ACCOUNT,
          LICENSE_SERVICE_NAME,
          activationResult.id
        )
      } catch (e) {
        console.error('Failed to store license credentials securely', e)
      }

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
