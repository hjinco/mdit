import { KEYS, type Value } from "@mdit/editor/plate"
import {
	getFileNameWithoutExtension,
	sanitizeFilename,
} from "@mdit/utils/path-utils"
import { useEffect, useRef } from "react"
import { useStore } from "@/store"

const UNTITLED_PATTERN = /^Untitled( \d+)?$/

/**
 * Sync the active tab name to the first heading on initial load (per tab id).
 * Prevents resyncing after a manual rename; resets when the tab id changes.
 */
export function useTabSyncedName(path: string, value: Value) {
	const hasSyncedForTab = useRef(false)
	const setActiveTabSyncedName = useStore((s) => s.setActiveTabSyncedName)

	// Sync the tab name to the first heading on initial render if conditions match.
	useEffect(() => {
		if (hasSyncedForTab.current) {
			return
		}

		const firstHeading = sanitizeFilename(getFirstHeadingText(value))

		const name = getFileNameWithoutExtension(path)
		const isUntitled = UNTITLED_PATTERN.test(name)
		const matchesHeading = firstHeading === name

		if (!matchesHeading && !isUntitled) {
			return
		}

		setActiveTabSyncedName(firstHeading || name)
		hasSyncedForTab.current = true
	}, [path, setActiveTabSyncedName, value])
}

function getFirstHeadingText(value: Value): string {
	if (!Array.isArray(value) || value.length === 0) {
		return ""
	}

	const firstBlock = value[0] as any

	if (!firstBlock || typeof firstBlock.type !== "string") {
		return ""
	}

	if (!KEYS.heading.includes(firstBlock.type)) {
		return ""
	}

	return extractTextFromNode(firstBlock)
}

function extractTextFromNode(node: any): string {
	if (typeof node === "string") {
		return node
	}
	if (node?.text) {
		return node.text
	}
	if (Array.isArray(node?.children)) {
		return node.children.map(extractTextFromNode).join("")
	}
	return ""
}
