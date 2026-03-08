import { describe, expect, it } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import { createDirectoryUiActions } from "./actions"

describe("directory-ui/actions", () => {
	it("setExpandedDirectories persists Set input", async () => {
		const { context, deps, setState, getState } = createActionTestContext()
		setState({ workspacePath: "/ws", expandedDirectories: ["/ws"] })
		const actions = createDirectoryUiActions(context)

		await actions.setExpandedDirectories(new Set(["/ws", "/ws/docs"]))

		expect(getState().expandedDirectories).toEqual(["/ws", "/ws/docs"])
		expect(
			deps.settingsRepository.persistExpandedDirectories,
		).toHaveBeenCalledWith("/ws", ["/ws", "/ws/docs"])
	})

	it("expandDirectory persists when path is newly expanded", async () => {
		const { context, deps, setState, getState } = createActionTestContext()
		setState({ workspacePath: "/ws", expandedDirectories: ["/ws"] })
		const actions = createDirectoryUiActions(context)

		await actions.expandDirectory("/ws/docs")

		expect(getState().expandedDirectories).toEqual(["/ws", "/ws/docs"])
		expect(
			deps.settingsRepository.persistExpandedDirectories,
		).toHaveBeenCalledWith("/ws", ["/ws", "/ws/docs"])
	})

	it("expandDirectory is idempotent", async () => {
		const { context, deps, setState, getState } = createActionTestContext()
		setState({ workspacePath: "/ws", expandedDirectories: ["/ws/docs"] })
		const actions = createDirectoryUiActions(context)

		await actions.expandDirectory("/ws/docs")

		expect(getState().expandedDirectories).toEqual(["/ws/docs"])
		expect(
			deps.settingsRepository.persistExpandedDirectories,
		).not.toHaveBeenCalled()
	})

	it("collapseDirectory persists only when path is currently expanded", async () => {
		const { context, deps, setState, getState } = createActionTestContext()
		setState({ workspacePath: "/ws", expandedDirectories: ["/ws", "/ws/docs"] })
		const actions = createDirectoryUiActions(context)

		await actions.collapseDirectory("/ws/docs")
		await actions.collapseDirectory("/ws/docs")

		expect(getState().expandedDirectories).toEqual(["/ws"])
		expect(
			deps.settingsRepository.persistExpandedDirectories,
		).toHaveBeenCalledTimes(1)
		expect(
			deps.settingsRepository.persistExpandedDirectories,
		).toHaveBeenCalledWith("/ws", ["/ws"])
	})
})
