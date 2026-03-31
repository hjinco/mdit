import { describe, expect, it, vi } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import {
	waitForActiveTabDescendantToSettle,
	waitForActiveTabPathToSettle,
	waitForActiveTabUnderPathsToSettle,
} from "./tab-guards"

describe("fs-tab-guards", () => {
	it("waitForActiveTabPathToSettle polls until tab becomes saved", async () => {
		const { context, ports, setState } = createActionTestContext()
		setState({ tab: { path: "/ws/a.md" }, isSaved: false })
		vi.useFakeTimers()

		try {
			const settlePromise = waitForActiveTabPathToSettle(context, "/ws/a.md")
			await vi.advanceTimersByTimeAsync(199)
			expect(ports.tab.getIsSaved).toHaveBeenCalledTimes(1)

			setState({ isSaved: true })
			await vi.advanceTimersByTimeAsync(1)
			await settlePromise

			expect(ports.tab.getIsSaved).toHaveBeenCalledTimes(2)
		} finally {
			vi.useRealTimers()
		}
	})

	it("waitForActiveTabDescendantToSettle does nothing when active tab is unrelated", async () => {
		const { context, ports, setState } = createActionTestContext()
		setState({ tab: { path: "/ws/other/a.md" }, isSaved: false })

		await waitForActiveTabDescendantToSettle(context, "/ws/source")

		expect(ports.tab.getIsSaved).toHaveBeenCalledTimes(0)
	})

	it("waitForActiveTabUnderPathsToSettle waits only when one path matches", async () => {
		const { context, ports, setState } = createActionTestContext()
		setState({ tab: { path: "/ws/source/a.md" }, isSaved: false })
		vi.useFakeTimers()

		try {
			const settlePromise = waitForActiveTabUnderPathsToSettle(context, [
				"/ws/other",
				"/ws/source",
			])
			await vi.advanceTimersByTimeAsync(199)
			expect(ports.tab.getIsSaved).toHaveBeenCalledTimes(1)
			setState({ isSaved: true })
			await vi.advanceTimersByTimeAsync(1)
			await settlePromise
		} finally {
			vi.useRealTimers()
		}
	})
})
