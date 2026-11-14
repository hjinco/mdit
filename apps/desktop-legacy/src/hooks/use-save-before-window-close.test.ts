import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useSaveBeforeWindowClose } from "./use-save-before-window-close"

type CloseHandler = (event: { preventDefault: () => void }) => Promise<void>

const { onCloseRequested, destroy, useEffect, showError } = vi.hoisted(() => ({
	onCloseRequested: vi.fn<(handler: CloseHandler) => Promise<() => void>>(),
	destroy: vi.fn<() => Promise<void>>(),
	useEffect: vi.fn<(effect: () => () => void) => void>(),
	showError: vi.fn(),
}))

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () => ({ onCloseRequested, destroy }),
}))
vi.mock("react", () => ({ useEffect }))
vi.mock("sonner", () => ({ toast: { error: showError } }))

describe("useSaveBeforeWindowClose", () => {
	const unlisten = vi.fn()
	let cleanup: (() => void) | undefined
	let handleClose: CloseHandler

	beforeEach(() => {
		vi.clearAllMocks()
		cleanup = undefined
		useEffect.mockImplementation((effect) => {
			cleanup = effect()
		})
		onCloseRequested.mockImplementation(async (handler) => {
			handleClose = handler
			return unlisten
		})
	})

	afterEach(() => {
		cleanup?.()
	})

	it("prevents the native close while one save finishes", async () => {
		let finishSave!: (result: boolean) => void
		const flush = vi.fn(
			() =>
				new Promise<boolean>((resolve) => {
					finishSave = resolve
				}),
		)
		useSaveBeforeWindowClose(flush)

		const preventDefault = vi.fn()
		const closing = handleClose({ preventDefault })
		await handleClose({ preventDefault })

		expect(preventDefault).toHaveBeenCalledTimes(2)
		expect(flush).toHaveBeenCalledTimes(1)
		expect(destroy).not.toHaveBeenCalled()

		finishSave(true)
		await closing
		expect(destroy).toHaveBeenCalledTimes(1)
	})

	it("leaves the window open when a save fails and allows a retry", async () => {
		const flush = vi.fn<() => Promise<boolean>>()
		flush.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
		useSaveBeforeWindowClose(flush)

		await handleClose({ preventDefault: vi.fn() })
		expect(destroy).not.toHaveBeenCalled()
		expect(showError).toHaveBeenCalledTimes(1)

		await handleClose({ preventDefault: vi.fn() })
		expect(destroy).toHaveBeenCalledTimes(1)
	})

	it("does not close a window after its route unmounts", async () => {
		let finishSave!: (result: boolean) => void
		useSaveBeforeWindowClose(
			() =>
				new Promise<boolean>((resolve) => {
					finishSave = resolve
				}),
		)

		const closing = handleClose({ preventDefault: vi.fn() })
		cleanup?.()
		cleanup = undefined
		finishSave(true)
		await closing

		expect(unlisten).toHaveBeenCalledTimes(1)
		expect(destroy).not.toHaveBeenCalled()
	})
})
