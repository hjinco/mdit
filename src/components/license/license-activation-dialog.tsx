import { KeyRoundIcon } from 'lucide-react'
import { useRef } from 'react'
import { useLicenseStore } from '@/store/license-store'
import { Button } from '@/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog'
import { Input } from '@/ui/input'

export function LicenseActivationDialog() {
  const {
    isLicenseDialogOpen,
    closeLicenseDialog,
    activateLicense,
    isValidating,
    error,
    clearLicenseError,
    licenseStatus,
  } = useLicenseStore()
  const inputRef = useRef<HTMLInputElement>(null)

  const allowClose = licenseStatus.isInTrial || licenseStatus.hasLicense

  const handleActivate = async () => {
    const trimmedKey = inputRef.current?.value.trim() ?? ''

    try {
      await activateLicense(trimmedKey)
      // Success - dialog will close automatically via store
    } catch {
      // Error is already set in store
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

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !allowClose) {
      // Prevent closing if not allowed
      return
    }
    if (!newOpen) {
      clearLicenseError()
      closeLicenseDialog()
    }
  }

  return (
    <Dialog open={isLicenseDialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={allowClose} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div className="p-3 rounded-full bg-primary/10">
              <KeyRoundIcon className="w-6 h-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center">License Activation</DialogTitle>
          <DialogDescription className="text-center">
            Enter your license key to activate Mdit. You can find your license
            key in your purchase confirmation email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Enter your license key"
            onKeyDown={handleKeyDown}
            disabled={isValidating}
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
            disabled={isValidating}
            className="w-full"
            size="lg"
          >
            {isValidating ? 'Activating...' : 'Activate License'}
          </Button>
        </div>

        <div className="pt-2 text-center">
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
      </DialogContent>
    </Dialog>
  )
}
