import { useEffect, useState } from 'react'
import { useGitSyncStore } from '@/store/git-sync-store'
import { useWorkspaceStore } from '@/store/workspace-store'
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
import { Switch } from '@/ui/switch'
import { Textarea } from '@/ui/textarea'

export function SyncTab() {
  const workspacePath = useWorkspaceStore((state) => state.workspacePath)
  const { getSyncConfig, setBranchName, setCommitMessage, setAutoSync } =
    useGitSyncStore()

  const [branchName, setBranchNameLocal] = useState('')
  const [commitMessage, setCommitMessageLocal] = useState('')
  const [autoSync, setAutoSyncLocal] = useState(false)

  // Update local state when workspacePath or config changes
  useEffect(() => {
    if (workspacePath) {
      const currentConfig = getSyncConfig(workspacePath)
      setBranchNameLocal(currentConfig.branchName)
      setCommitMessageLocal(currentConfig.commitMessage)
      setAutoSyncLocal(currentConfig.autoSync)
    } else {
      setBranchNameLocal('')
      setCommitMessageLocal('')
      setAutoSyncLocal(false)
    }
  }, [workspacePath, getSyncConfig])

  const handleBranchNameChange = (value: string) => {
    setBranchNameLocal(value)
    if (workspacePath) {
      setBranchName(workspacePath, value)
    }
  }

  const handleCommitMessageChange = (value: string) => {
    setCommitMessageLocal(value)
    if (workspacePath) {
      setCommitMessage(workspacePath, value)
    }
  }

  const handleAutoSyncChange = (checked: boolean) => {
    setAutoSyncLocal(checked)
    if (workspacePath) {
      setAutoSync(workspacePath, checked)
    }
  }

  if (!workspacePath) {
    return (
      <div className="flex-1 overflow-y-auto p-12">
        <FieldSet>
          <FieldLegend>Git Sync Settings</FieldLegend>
          <FieldDescription>
            Please open a workspace to configure Git sync settings.
          </FieldDescription>
        </FieldSet>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-12">
      <FieldSet>
        <FieldLegend>Git Sync Settings</FieldLegend>
        <FieldDescription>
          Configure Git sync settings for this workspace
        </FieldDescription>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Auto Sync</FieldLabel>
              <FieldDescription>
                Automatically sync Git every minute when workspace is unsynced.
                Git sync will only run if there are uncommitted changes or the
                repository is ahead/behind the remote.
              </FieldDescription>
            </FieldContent>
            <Switch checked={autoSync} onCheckedChange={handleAutoSyncChange} />
          </Field>

          <Field orientation="vertical">
            <FieldContent>
              <FieldLabel>Branch Name</FieldLabel>
              <FieldDescription>
                Specify a branch name for Git sync operations. Leave empty to
                use the current branch.
              </FieldDescription>
            </FieldContent>
            <Input
              value={branchName}
              onChange={(e) => handleBranchNameChange(e.target.value)}
              placeholder="Leave empty to use current branch"
            />
          </Field>

          <Field orientation="vertical">
            <FieldContent>
              <FieldLabel>Commit Message</FieldLabel>
              <FieldDescription>
                Custom commit message template. Leave empty to use the default
                message. You can use variables like {'{date}'} in the message.
              </FieldDescription>
            </FieldContent>
            <Textarea
              value={commitMessage}
              onChange={(e) => handleCommitMessageChange(e.target.value)}
              placeholder="Leave empty to use default message"
              rows={4}
            />
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  )
}
