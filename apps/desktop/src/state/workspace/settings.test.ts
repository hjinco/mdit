import { describe, expect, it, vi } from "vitest"
import {
	createWorkspaceSettingsRepository,
	readDirectorySettings,
	readOpenedFileSettings,
} from "./settings"

describe("workspace settings", () => {
	it("serializes field patches against the latest workspace config", async () => {
		let file = JSON.stringify({
			gitSync: { branchName: "main", commitMessage: "Saved", autoSync: true },
			pinnedDirectories: ["notes"],
			legacyExtension: { value: true },
		})
		let releaseWrite!: () => void
		const waitToWrite = new Promise<void>((resolve) => {
			releaseWrite = resolve
		})
		const fileSystem = {
			exists: async () => true,
			readTextFile: vi.fn(async () => file),
			mkdir: async () => {},
			writeTextFile: vi.fn(async (_path: string, content: string) => {
				await waitToWrite
				file = content
			}),
		}
		const settings = createWorkspaceSettingsRepository(fileSystem)
		const writes = [
			settings.saveSettings("/vault", { gitSync: { branchName: "next" } }),
			settings.saveSettings("/vault", { lastOpenedFilePaths: ["notes/a.md"] }),
			settings.saveSettings("/vault", { gitSync: { autoSync: false } }),
		]
		await vi.waitFor(() =>
			expect(fileSystem.writeTextFile).toHaveBeenCalledTimes(1),
		)
		expect(fileSystem.readTextFile).toHaveBeenCalledTimes(1)
		releaseWrite()

		await Promise.all(writes)
		expect(await settings.loadSettings("/vault")).toEqual({
			gitSync: { branchName: "next", commitMessage: "Saved", autoSync: false },
			pinnedDirectories: ["notes"],
			lastOpenedFilePaths: ["notes/a.md"],
			legacyExtension: { value: true },
		})
	})

	it("restores old absolute paths and rejects paths outside the workspace", () => {
		expect(
			readDirectorySettings("/vault", [
				".",
				"notes",
				"/vault/inbox",
				"../outside",
			]),
		).toEqual(["/vault", "/vault/notes", "/vault/inbox"])
		expect(
			readOpenedFileSettings("/vault", [
				"notes/a.md",
				"/vault/b.md",
				"../outside.md",
			]),
		).toEqual(["/vault/notes/a.md", "/vault/b.md"])
	})

	it.each([
		'{"truncated":',
		"[]",
	])("recovers writes from invalid settings %s", async (invalid) => {
		let file = invalid
		const settings = createWorkspaceSettingsRepository({
			exists: async () => true,
			readTextFile: async () => file,
			mkdir: async () => {},
			writeTextFile: async (_path, content) => {
				file = content
			},
		})
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		try {
			await settings.saveSettings("/vault", { pinnedDirectories: ["notes"] })
			expect(await settings.loadSettings("/vault")).toEqual({
				pinnedDirectories: ["notes"],
			})
		} finally {
			warn.mockRestore()
		}
	})

	it("propagates settings read errors without overwriting the file", async () => {
		const error = new Error("Permission denied")
		const writeTextFile = vi.fn()
		const settings = createWorkspaceSettingsRepository({
			exists: async () => true,
			readTextFile: vi.fn().mockRejectedValue(error),
			mkdir: async () => {},
			writeTextFile,
		})

		await expect(
			settings.saveSettings("/vault", { pinnedDirectories: ["notes"] }),
		).rejects.toThrow(error)
		expect(writeTextFile).not.toHaveBeenCalled()
	})
})
