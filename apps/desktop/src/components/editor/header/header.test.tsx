import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { Header } from "./header"

const mockUseStore = vi.fn()

vi.mock("@/store", () => ({
	useStore: (selector: (state: object) => unknown) => mockUseStore(selector),
}))

vi.mock("@/hooks/use-current-window-label", () => ({
	useCurrentWindowLabel: vi.fn(() => null),
}))

vi.mock("@/hooks/use-is-fullscreen", () => ({
	useIsFullscreen: vi.fn(() => false),
}))

vi.mock("@/utils/platform", () => ({
	isMac: vi.fn(() => false),
}))

vi.mock("./history-navigation", () => ({
	HistoryNavigation: () => <div data-testid="history-navigation" />,
}))

vi.mock("./info-button", () => ({
	InfoButton: () => <div data-testid="info-button" />,
}))

vi.mock("./tab", () => ({
	TabStrip: () => <div data-testid="tab-strip" />,
}))

vi.mock("@/components/quick-note/window-pin-button", () => ({
	WindowPinButton: () => <div data-testid="window-pin-button" />,
}))

describe("Header", () => {
	it("keeps history navigation visible without tabs but hides the info button", () => {
		mockUseStore.mockImplementation((selector) =>
			selector({
				isFileExplorerOpen: true,
				isFocusMode: false,
				currentCollectionPath: null,
				workspacePath: "/workspace",
				isEditMode: false,
				tabs: [],
			}),
		)

		const html = renderToStaticMarkup(<Header />)

		expect(html).toContain("history-navigation")
		expect(html).toContain("tab-strip")
		expect(html).not.toContain("info-button")
	})

	it("shows the info button when tabs exist", () => {
		mockUseStore.mockImplementation((selector) =>
			selector({
				isFileExplorerOpen: true,
				isFocusMode: false,
				currentCollectionPath: null,
				workspacePath: "/workspace",
				isEditMode: false,
				tabs: [{ id: 1 }],
			}),
		)

		const html = renderToStaticMarkup(<Header />)

		expect(html).toContain("history-navigation")
		expect(html).toContain("info-button")
	})

	it("hides navigation entirely when navigation is disabled", () => {
		mockUseStore.mockImplementation((selector) =>
			selector({
				isFileExplorerOpen: true,
				isFocusMode: false,
				currentCollectionPath: null,
				workspacePath: "/workspace",
				isEditMode: false,
				tabs: [],
			}),
		)

		const html = renderToStaticMarkup(<Header hideNavigation />)

		expect(html).not.toContain("history-navigation")
		expect(html).not.toContain("tab-strip")
		expect(html).not.toContain("info-button")
	})
})
