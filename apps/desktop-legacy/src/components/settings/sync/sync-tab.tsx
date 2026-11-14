import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@mdit/ui/components/field"
import { Input } from "@mdit/ui/components/input"
import { Switch } from "@mdit/ui/components/switch"
import { Textarea } from "@mdit/ui/components/textarea"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useShallow } from "zustand/shallow"
import { useDesktopRuntime, useWorkspaceState } from "@/state"
import type { SyncConfig } from "@/state/services/git-sync"

export function SyncTab() {
	const { workspacePath, sessionId } = useWorkspaceState(
		useShallow(({ workspacePath, sessionId }) => ({
			workspacePath,
			sessionId,
		})),
	)

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

	return <SyncSettingsForm key={sessionId} workspacePath={workspacePath} />
}

async function persistSetting(write: () => Promise<void>): Promise<boolean> {
	try {
		await write()
		return true
	} catch (error) {
		console.error("Failed to save Git sync settings:", error)
		toast.error("Failed to save Git sync settings.")
		return false
	}
}

function SyncSettingsForm({ workspacePath }: { workspacePath: string }) {
	const { getSyncConfig, setBranchName, setCommitMessage, setAutoSync } =
		useDesktopRuntime().gitSync.commands
	const [config, setConfig] = useState<SyncConfig | null>(null)
	const [isSavingAutoSync, setIsSavingAutoSync] = useState(false)

	useEffect(() => {
		let active = true
		void getSyncConfig(workspacePath)
			.then((loaded) => {
				if (active) {
					setConfig(loaded)
				}
			})
			.catch((error) => {
				if (active) {
					console.error("Failed to load Git sync settings:", error)
					toast.error("Failed to load Git sync settings.")
				}
			})
		return () => {
			active = false
		}
	}, [workspacePath, getSyncConfig])

	const handleBranchNameChange = (branchName: string) => {
		setConfig((current) => current && { ...current, branchName })
		void persistSetting(() => setBranchName(workspacePath, branchName))
	}

	const handleCommitMessageChange = (commitMessage: string) => {
		setConfig((current) => current && { ...current, commitMessage })
		void persistSetting(() => setCommitMessage(workspacePath, commitMessage))
	}

	const handleAutoSyncChange = async (autoSync: boolean) => {
		setIsSavingAutoSync(true)
		if (await persistSetting(() => setAutoSync(workspacePath, autoSync))) {
			setConfig((current) => current && { ...current, autoSync })
		}
		setIsSavingAutoSync(false)
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
						<Switch
							checked={config?.autoSync ?? false}
							disabled={!config || isSavingAutoSync}
							onCheckedChange={handleAutoSyncChange}
						/>
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
							value={config?.branchName ?? ""}
							disabled={!config}
							onChange={(e) => handleBranchNameChange(e.target.value)}
							placeholder="Leave empty to use current branch"
						/>
					</Field>

					<Field orientation="vertical">
						<FieldContent>
							<FieldLabel>Commit Message</FieldLabel>
							<FieldDescription>
								Custom commit message template. Leave empty to use the default
								message. You can use variables like {"{date}"} in the message.
							</FieldDescription>
						</FieldContent>
						<Textarea
							value={config?.commitMessage ?? ""}
							disabled={!config}
							onChange={(e) => handleCommitMessageChange(e.target.value)}
							placeholder="Leave empty to use default message"
							rows={4}
							className="px-2 py-1.5"
						/>
					</Field>
				</FieldGroup>
			</FieldSet>
		</div>
	)
}
