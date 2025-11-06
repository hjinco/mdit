import { useEffect, useState } from 'react'
import { useUIStore } from '@/store/ui-store'
import { Dialog, DialogContent } from '@/ui/dialog'
import { AITab } from './ui/ai-tab'
import { SettingsNavigation, type SettingsTab } from './ui/navigation'
import { PreferencesTab } from './ui/preferences-tab'
import { SyncTab } from './ui/sync-tab'

export function SettingsDialog() {
  const { isSettingsDialogOpen, setSettingsDialogOpen, settingsInitialTab } =
    useUIStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('preferences')

  useEffect(() => {
    if (isSettingsDialogOpen && settingsInitialTab) {
      setActiveTab(settingsInitialTab)
    }
  }, [isSettingsDialogOpen, settingsInitialTab])

  const handleOpenChange = (open: boolean) => {
    setSettingsDialogOpen(open)
    // Reset initial tab when dialog closes
    if (!open) {
      useUIStore.setState({ settingsInitialTab: null })
    }
  }

  return (
    <Dialog open={isSettingsDialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="md:max-w-4xl max-h-[660px] w-full h-full p-0 overflow-hidden flex">
        <SettingsNavigation activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="flex-1 flex flex-col">
          {activeTab === 'preferences' && <PreferencesTab />}
          {activeTab === 'ai' && <AITab />}
          {activeTab === 'sync' && <SyncTab />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
