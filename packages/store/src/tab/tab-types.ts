export type TabHistoryPoint = {
	path: number[]
	offset: number
}

export type TabHistorySelection = {
	anchor: TabHistoryPoint
	focus: TabHistoryPoint
} | null

export type TabHistoryEntry = {
	path: string
	selection: TabHistorySelection
}

export type TabNavigationState = {
	history: TabHistoryEntry[]
	historyIndex: number
}

export type OpenDocument = {
	id: number
	path: string
	name: string
	content: string
	sessionEpoch: number
	isSaved: boolean
}

export type Tab = TabNavigationState & {
	id: number
	documentId: number
}

export type ResolvedTab = TabNavigationState &
	Pick<
		OpenDocument,
		"content" | "isSaved" | "name" | "path" | "sessionEpoch"
	> & {
		id: number
		documentId: number
	}

export type PendingHistorySelectionRestoreResult =
	| {
			found: false
	  }
	| {
			found: true
			selection: TabHistorySelection
	  }

export type OpenDocumentSnapshot = {
	documentId: number
	path: string
	isSaved: boolean
}

export type OpenTabSnapshot = {
	path: string
	isSaved: boolean
}
