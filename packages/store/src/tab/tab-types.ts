export type Tab = {
	id: number
	path: string
	name: string
	content: string
	syncedName?: string | null
}

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

export type PendingHistorySelectionRestoreResult =
	| {
			found: false
	  }
	| {
			found: true
			selection: TabHistorySelection
	  }

export type OpenTabSnapshot = {
	path: string
	isSaved: boolean
}

export type TabSaveStateMap = Record<number, boolean>
