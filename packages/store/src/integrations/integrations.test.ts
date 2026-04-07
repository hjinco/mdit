import { describe, expect, it, vi } from "vitest"
import type { MditStore } from ".."
import { registerGitSyncWorkspaceIntegration } from "./register-git-sync-workspace-integration"
import { registerIndexingIntegration } from "./register-indexing-integration"
import { createStoreEventHub } from "./store-events"

describe("store integrations", () => {
	it("resets indexing state when workspace resets", async () => {
		const events = createStoreEventHub()
		const state = {
			resetIndexingState: vi.fn(),
			getIndexingConfig: vi.fn(),
		}
		const store = {
			getState: () => state,
		} as unknown as MditStore

		registerIndexingIntegration(store, events)
		await events.emit({
			type: "workspace/reset",
			workspacePath: "/ws",
		})

		expect(state.resetIndexingState).toHaveBeenCalledTimes(1)
	})

	it("preloads indexing config when workspace loads", async () => {
		const events = createStoreEventHub()
		const getIndexingConfig = vi.fn().mockResolvedValue(null)
		const store = {
			getState: () => ({
				resetIndexingState: vi.fn(),
				getIndexingConfig,
			}),
		} as unknown as MditStore

		registerIndexingIntegration(store, events)
		await events.emit({
			type: "workspace/loaded",
			workspacePath: "/ws",
		})

		expect(getIndexingConfig).toHaveBeenCalledWith("/ws")
	})

	it("logs indexing preload failures without throwing", async () => {
		const events = createStoreEventHub()
		const preloadError = new Error("preload failed")
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		const store = {
			getState: () => ({
				resetIndexingState: vi.fn(),
				getIndexingConfig: vi.fn().mockRejectedValue(preloadError),
			}),
		} as unknown as MditStore

		registerIndexingIntegration(store, events)
		await events.emit({
			type: "workspace/loaded",
			workspacePath: "/ws",
		})

		expect(errorSpy).toHaveBeenCalledWith(
			"Failed to preload indexing config:",
			preloadError,
		)

		errorSpy.mockRestore()
	})

	it("refreshes the active workspace when sync pulled changes", async () => {
		const events = createStoreEventHub()
		const refreshWorkspaceEntries = vi.fn().mockResolvedValue(undefined)
		const store = {
			getState: () => ({
				workspacePath: "/ws",
				refreshWorkspaceEntries,
			}),
		} as unknown as MditStore

		registerGitSyncWorkspaceIntegration(store, events)
		await events.emit({
			type: "git-sync/pulled-changes",
			workspacePath: "/ws",
		})

		expect(refreshWorkspaceEntries).toHaveBeenCalledTimes(1)
	})

	it("propagates workspace refresh failures for sync pulled changes", async () => {
		const events = createStoreEventHub()
		const refreshError = new Error("refresh failed")
		const store = {
			getState: () => ({
				workspacePath: "/ws",
				refreshWorkspaceEntries: vi.fn().mockRejectedValue(refreshError),
			}),
		} as unknown as MditStore

		registerGitSyncWorkspaceIntegration(store, events)

		await expect(
			events.emit({
				type: "git-sync/pulled-changes",
				workspacePath: "/ws",
			}),
		).rejects.toThrow("refresh failed")
	})

	it("ignores sync refresh events for a different workspace", async () => {
		const events = createStoreEventHub()
		const refreshWorkspaceEntries = vi.fn().mockResolvedValue(undefined)
		const store = {
			getState: () => ({
				workspacePath: "/other",
				refreshWorkspaceEntries,
			}),
		} as unknown as MditStore

		registerGitSyncWorkspaceIntegration(store, events)
		await events.emit({
			type: "git-sync/pulled-changes",
			workspacePath: "/ws",
		})

		expect(refreshWorkspaceEntries).not.toHaveBeenCalled()
	})
})
