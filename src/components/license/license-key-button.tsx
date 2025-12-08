import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { useLicenseStore } from '../../store/license-store'
import { useUIStore } from '../../store/ui-store'
import { Button } from '../../ui/button'

export function LicenseKeyButton() {
  const { status, checkLicense } = useLicenseStore(
    useShallow((s) => ({
      status: s.status,
      checkLicense: s.checkLicense,
    }))
  )
  const openSettingsWithTab = useUIStore((s) => s.openSettingsWithTab)

  useEffect(() => {
    // Check license when online
    if (navigator.onLine) {
      checkLicense()
      return
    }

    // Listen to online event to check when connection is restored
    const handleOnline = () => {
      checkLicense()
    }

    window.addEventListener('online', handleOnline)

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline)
    }
  }, [checkLicense])

  if (status === 'valid') {
    return null
  }

  return (
    <Button
      variant="ghost"
      className="text-xs h-5 px-2 text-muted-foreground hover:bg-transparent dark:hover:bg-transparent hover:text-foreground"
      onClick={() => openSettingsWithTab('license')}
    >
      License Key
    </Button>
  )
}
