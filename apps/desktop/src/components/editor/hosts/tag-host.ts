import type { TagHostDeps } from "@mdit/editor/tag"
import { useStore } from "@/store"

export const createDesktopTagHost = (): TagHostDeps => ({
	openTagSearch: (query) => {
		useStore.getState().openCommandMenuWithQuery(query)
	},
})
