import { createGitSyncCore, type GitPorts } from "@mdit/git-sync"
import {
	exists,
	mkdir,
	readTextFile,
	writeTextFile,
} from "@tauri-apps/plugin-fs"
import { Command } from "@tauri-apps/plugin-shell"
import { join } from "pathe"

export type {
	GitSyncCore,
	GitSyncStatus,
	SyncConfig,
	SyncResult,
} from "@mdit/git-sync"

const createDesktopGitPorts = (): GitPorts => ({
	gitExec: async (workspacePath, args) => {
		const command = Command.create("git", [
			"-C",
			workspacePath,
			"-c",
			"protocol.ext.allow=never",
			...args,
		])
		const result = await command.execute()
		return {
			code: result.code === null ? 1 : result.code,
			stdout: result.stdout,
			stderr: result.stderr,
		}
	},
	exists,
	mkdir,
	readTextFile,
	writeTextFile,
	join,
	now: () => new Date(),
})

export const createDesktopGitSyncCore = () =>
	createGitSyncCore(createDesktopGitPorts())
