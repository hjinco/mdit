import type { GitExecResult } from "./types"

export type GitPorts = {
	gitExec: (workspacePath: string, args: string[]) => Promise<GitExecResult>
	exists: (path: string) => Promise<boolean>
	mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>
	readTextFile: (path: string) => Promise<string>
	writeTextFile: (path: string, content: string) => Promise<void>
	join: (...paths: string[]) => string
	now: () => Date
}
