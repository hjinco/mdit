import { openUrl } from '@tauri-apps/plugin-opener'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useLicenseStore } from '@/store/license-store'
import { Button } from '@/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/ui/field'
import { Input } from '@/ui/input'

export function LicenseTab() {
  const {
    status,
    error,
    clearLicenseError,
    registerLicenseKey,
    deactivateLicense,
  } = useLicenseStore(
    useShallow((s) => ({
      status: s.status,
      error: s.error,
      clearLicenseError: s.clearLicenseError,
      registerLicenseKey: s.registerLicenseKey,
      deactivateLicense: s.deactivateLicense,
    }))
  )

  const [licenseKey, setLicenseKey] = useState<string>('')

  const handleActivate = async () => {
    if (!licenseKey) return
    await registerLicenseKey(licenseKey)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Clear errors when user starts typing
    if (error) {
      clearLicenseError()
    }
    setLicenseKey(e.target.value)
  }

  const getStatusMessage = () => {
    if (status === 'valid') {
      return {
        text: 'License activated',
        icon: <CheckCircle2 className="size-4 text-green-500" />,
        color: 'text-green-500',
      }
    }

    return {
      text: 'Not activated',
      icon: <XCircle className="size-4 text-destructive" />,
      color: 'text-destructive',
    }
  }

  const statusInfo = getStatusMessage()
  const isLoading =
    status === 'validating' ||
    status === 'activating' ||
    status === 'deactivating'

  const handleDeactivate = async () => {
    await deactivateLicense()
  }

  return (
    <div className="flex-1 overflow-y-auto p-12">
      <FieldSet>
        <FieldLegend>License</FieldLegend>
        <FieldDescription>
          Manage your Mdit license activation{' '}
          <a
            href="https://polar.sh/mdit/portal"
            onClick={(e) => {
              e.preventDefault()
              openUrl('https://polar.sh/mdit/portal')
            }}
          >
            Polar Customer Portal
          </a>
        </FieldDescription>

        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Status</FieldLabel>
            </FieldContent>
            <div className={`flex items-center gap-2 ${statusInfo.color}`}>
              {statusInfo.icon}
              <span className="text-sm">{statusInfo.text}</span>
            </div>
          </Field>

          {status === 'valid' && (
            <Field orientation="vertical">
              <FieldContent>
                <FieldDescription>
                  Your license is currently activated. You can deactivate it to
                  free up an activation slot.
                </FieldDescription>
              </FieldContent>
              <div className="flex items-start gap-2 mt-2">
                <Button
                  variant="outline"
                  onClick={handleDeactivate}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Deactivating...
                    </>
                  ) : (
                    'Deactivate License'
                  )}
                </Button>
              </div>
              {error && (
                <p className="text-sm text-destructive mt-2">{error}</p>
              )}
            </Field>
          )}

          {status !== 'valid' && (
            <Field orientation="vertical">
              <FieldContent>
                <FieldLabel htmlFor="license-key">License Key</FieldLabel>
                <FieldDescription>
                  Enter your license key to activate Mdit
                </FieldDescription>
              </FieldContent>
              <div className="flex items-start gap-2 mt-2">
                <div className="flex-1">
                  <Input
                    id="license-key"
                    type="text"
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    autoComplete="off"
                    spellCheck="false"
                    disabled={isLoading}
                    onChange={handleInputChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isLoading) {
                        handleActivate()
                      }
                    }}
                  />
                  {error && (
                    <p className="text-sm text-destructive mt-2">{error}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={handleActivate}
                  disabled={isLoading || !licenseKey}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Activating...
                    </>
                  ) : (
                    'Activate'
                  )}
                </Button>
              </div>
            </Field>
          )}
        </FieldGroup>
      </FieldSet>
    </div>
  )
}
