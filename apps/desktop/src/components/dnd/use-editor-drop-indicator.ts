import { useCallback, useEffect, useRef, useState } from "react"
import {
	areEditorDropIndicatorsEqual,
	computeEditorDropIndicator,
	type EditorDropIndicator,
	type Point,
} from "./editor-drop-indicator.helpers"

export function useEditorDropIndicator() {
	const [editorDropIndicator, setEditorDropIndicator] =
		useState<EditorDropIndicator | null>(null)
	const lastPointerRef = useRef<Point | null>(null)
	const isDraggingRef = useRef(false)
	const frameRef = useRef<number | null>(null)

	const applyEditorDropIndicator = useCallback((point: Point | null) => {
		const nextIndicator = point ? computeEditorDropIndicator(point) : null
		setEditorDropIndicator((current) => {
			return areEditorDropIndicatorsEqual(current, nextIndicator)
				? current
				: nextIndicator
		})
	}, [])

	const cancelScheduledIndicatorUpdate = useCallback(() => {
		if (frameRef.current !== null) {
			window.cancelAnimationFrame(frameRef.current)
			frameRef.current = null
		}
	}, [])

	const scheduleEditorDropIndicator = useCallback(
		(point: Point | null) => {
			lastPointerRef.current = point

			if (frameRef.current !== null) {
				return
			}

			frameRef.current = window.requestAnimationFrame(() => {
				frameRef.current = null
				applyEditorDropIndicator(lastPointerRef.current)
			})
		},
		[applyEditorDropIndicator],
	)

	const resetEditorDropIndicator = useCallback(() => {
		cancelScheduledIndicatorUpdate()
		lastPointerRef.current = null
		setEditorDropIndicator(null)
	}, [cancelScheduledIndicatorUpdate])

	useEffect(() => {
		return () => {
			cancelScheduledIndicatorUpdate()
		}
	}, [cancelScheduledIndicatorUpdate])

	useEffect(() => {
		const handleScroll = () => {
			if (!isDraggingRef.current || !lastPointerRef.current) {
				return
			}

			scheduleEditorDropIndicator(lastPointerRef.current)
		}

		window.addEventListener("scroll", handleScroll, true)
		return () => {
			window.removeEventListener("scroll", handleScroll, true)
		}
	}, [scheduleEditorDropIndicator])

	const startDragging = useCallback(
		(point: Point | null) => {
			isDraggingRef.current = true
			scheduleEditorDropIndicator(point)
		},
		[scheduleEditorDropIndicator],
	)

	const updateDragging = useCallback(
		(point: Point | null) => {
			scheduleEditorDropIndicator(point)
		},
		[scheduleEditorDropIndicator],
	)

	const completeDragging = useCallback(
		(point: Point | null) => {
			const finalPoint = point ?? lastPointerRef.current
			cancelScheduledIndicatorUpdate()
			const syntheticTarget = finalPoint
				? (computeEditorDropIndicator(finalPoint)?.targetData ?? null)
				: null
			isDraggingRef.current = false
			resetEditorDropIndicator()
			return syntheticTarget
		},
		[cancelScheduledIndicatorUpdate, resetEditorDropIndicator],
	)

	return {
		editorDropIndicator,
		startDragging,
		updateDragging,
		completeDragging,
	}
}
