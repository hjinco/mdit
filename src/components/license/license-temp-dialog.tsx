import { useEffect, useState } from 'react'
import { getPassword, setPassword } from 'tauri-plugin-keyring-api'
import { Button } from '@/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/ui/dialog'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'

const LICENSE_SERVICE = 'app.mdit.license.lifetime'
const LICENSE_USER = 'mdit'

// Validation regex for MDIT-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX format
const LICENSE_KEY_REGEX =
  /^MDIT-[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/i

export function LicenseTempDialog() {
  const [licenseKey, setLicenseKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [hasLicense, setHasLicense] = useState(true)

  const validateLicenseKey = (key: string): boolean => {
    return LICENSE_KEY_REGEX.test(key)
  }

  const handleSave = async () => {
    const trimmedKey = licenseKey.trim()

    if (!trimmedKey) {
      setError('License key is required')
      return
    }

    if (!validateLicenseKey(trimmedKey)) {
      setError('Invalid license key')
      return
    }

    setIsLoading(true)
    try {
      await setPassword(LICENSE_SERVICE, LICENSE_USER, trimmedKey)
      setLicenseKey('')
      setError(null)
      setIsOpen(false)
      setHasLicense(true)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save license key'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  useEffect(() => {
    const checkLicense = async () => {
      try {
        const savedKey = await getPassword(LICENSE_SERVICE, LICENSE_USER)
        setHasLicense(!!savedKey)
      } catch {
        setHasLicense(false)
      }
    }

    checkLicense()
  }, [])

  if (hasLicense) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="text-xs h-5 px-2 text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          License Key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register License Key</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="license-key">License Key</Label>
            <Input
              id="license-key"
              type="text"
              value={licenseKey}
              onChange={(e) => {
                setLicenseKey(e.target.value)
                if (error) setError(null)
              }}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="text-center font-mono"
              spellCheck={false}
              autoComplete="off"
              autoFocus
            />
          </div>

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive text-center">{error}</p>
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={isLoading || !licenseKey.trim()}
            className="w-full"
          >
            {isLoading ? 'Saving...' : 'Save License Key'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
