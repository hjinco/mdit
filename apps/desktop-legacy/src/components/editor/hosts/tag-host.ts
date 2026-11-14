import type { TagHostDeps } from "@mdit/editor/tag"
import { getDesktopRuntime } from "@/state"

export const createDesktopTagHost = (): TagHostDeps => ({
	openTagSearch: (query) => {
		getDesktopRuntime().window.commands.openCommandMenuWithQuery(query)
	},
})
