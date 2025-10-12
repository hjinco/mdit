import { KeyRoundIcon, Loader2Icon } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { activateLicenseKey, validateLicenseKey } from './lib/license-api'

const LICENSE_KEY_STORAGE_KEY = 'license-key'
const ACTIVATION_ID_STORAGE_KEY = 'license-activation-id'

type Props = {
  children: ReactNode
}

export function LicenseActivation({ children }: Props) {
  const [isChecking, setIsChecking] = useState(true)
  const [isValid, setIsValid] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Check for existing license on mount
  useEffect(() => {
    const checkExistingLicense = async () => {
      const storedKey = localStorage.getItem(LICENSE_KEY_STORAGE_KEY)
      const storedActivationId = localStorage.getItem(ACTIVATION_ID_STORAGE_KEY)

      // No stored license data
      if (!storedKey || !storedActivationId) {
        setIsChecking(false)
        setIsValid(false)
        return
      }

      // Try to validate the stored license
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
          setError('License has expired')
          setIsValid(false)
          setIsChecking(false)
          return
        }

        // License is valid
        setIsValid(true)
        setIsChecking(false)
      } catch (validationError) {
        // Validation failed, clear stored data
        localStorage.removeItem(LICENSE_KEY_STORAGE_KEY)
        localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY)

        setError(
          validationError instanceof Error
            ? validationError.message
            : 'License validation failed'
        )
        setIsValid(false)
        setIsChecking(false)
      }
    }

    checkExistingLicense()
  }, [])

  const handleActivate = async () => {
    const trimmedKey = inputRef.current?.value.trim() ?? ''

    if (!trimmedKey) {
      setError('Please enter a license key')
      return
    }

    setIsActivating(true)
    setError(null)

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
        setError('License has expired')
        setIsActivating(false)
        return
      }

      // Store license data
      localStorage.setItem(LICENSE_KEY_STORAGE_KEY, trimmedKey)
      localStorage.setItem(ACTIVATION_ID_STORAGE_KEY, activationResult.id)

      // Mark as valid
      setIsValid(true)
      setError(null)
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : 'License activation failed'
      )
    } finally {
      setIsActivating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleActivate()
    } else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      // Select all text in the input
      if (inputRef.current) {
        inputRef.current.select()
      }
    }
  }

  // Show loading while checking
  if (isChecking) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <Loader2Icon className="w-8 h-8 text-muted-foreground animate-spin" />
      </div>
    )
  }

  // Show children if valid
  if (isValid) {
    return <>{children}</>
  }

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-background">
      <div className="max-w-md w-full px-4">
        <div className="text-center space-y-2 mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-primary/10">
              <KeyRoundIcon className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-semibold text-foreground">
            License Activation
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Enter your license key to activate Mdit. You can find your license
            key in your purchase confirmation email.
          </p>
        </div>

        <div className="space-y-4">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Enter your license key"
            onKeyDown={handleKeyDown}
            disabled={isActivating}
            className="text-center font-mono"
            spellCheck={false}
            autoComplete="off"
            autoFocus
          />

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive text-center">{error}</p>
            </div>
          )}

          <Button
            onClick={handleActivate}
            disabled={isActivating}
            className="w-full"
            size="lg"
          >
            {isActivating ? 'Activating...' : 'Activate License'}
          </Button>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-muted-foreground">
            <a
              href="https://polar.sh/mdit/portal"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Polar Customer Portal
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
