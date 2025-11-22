import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Dialog, DialogContent } from '@/ui/dialog'
import { AITab } from './ui/ai-tab'
import { IndexingTab } from './ui/indexing-tab'
import { SettingsNavigation, type SettingsTab } from './ui/navigation'
import { PreferencesTab } from './ui/preferences-tab'
import { SyncTab } from './ui/sync-tab'

export function SettingsDialog() {
  const { isSettingsDialogOpen, setSettingsDialogOpen, settingsInitialTab } =
    useUIStore(
      useShallow((s) => ({
        isSettingsDialogOpen: s.isSettingsDialogOpen,
        setSettingsDialogOpen: s.setSettingsDialogOpen,
        settingsInitialTab: s.settingsInitialTab,
      }))
    )
  const workspacePath = useWorkspaceStore((s) => s.workspacePath)
  const [activeTab, setActiveTab] = useState<SettingsTab>('preferences')

  useEffect(() => {
    if (isSettingsDialogOpen && settingsInitialTab) {
      setActiveTab(settingsInitialTab)
    }
  }, [isSettingsDialogOpen, settingsInitialTab])

  // Redirect to preferences if active tab is not available
  useEffect(() => {
    if (!workspacePath && (activeTab === 'sync' || activeTab === 'indexing')) {
      setActiveTab('preferences')
    }
  }, [workspacePath, activeTab])

  const handleOpenChange = (open: boolean) => {
    setSettingsDialogOpen(open)
    // Reset initial tab when dialog closes
    if (!open) {
      useUIStore.setState({ settingsInitialTab: null })
    }
  }

  return (
    <Dialog open={isSettingsDialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="md:max-w-4xl max-h-[min(660px,calc(100vh-6rem))] w-full h-full p-0 overflow-hidden flex">
        <SettingsNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hasWorkspace={!!workspacePath}
        />

        <div className="flex-1 flex flex-col">
          {activeTab === 'preferences' && <PreferencesTab />}
          {activeTab === 'ai' && <AITab />}
          {activeTab === 'sync' && <SyncTab />}
          {activeTab === 'indexing' && <IndexingTab />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
