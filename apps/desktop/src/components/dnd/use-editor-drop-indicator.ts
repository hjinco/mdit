import { useCallback, useEffect, useRef, useState } from "react"
import {
	areEditorDropStatesEqual,
	computeEditorDropState,
	type EditorDropState,
	EMPTY_EDITOR_DROP_STATE,
	type Point,
} from "./editor-drop-indicator.helpers"

export function useEditorDropIndicator() {
	const [editorDropState, setEditorDropState] = useState<EditorDropState>(
		EMPTY_EDITOR_DROP_STATE,
	)
	const lastPointerRef = useRef<Point | null>(null)
	const isDraggingRef = useRef(false)
	const frameRef = useRef<number | null>(null)

	const applyEditorDropState = useCallback((point: Point | null) => {
		const nextState = point
			? computeEditorDropState(point)
			: EMPTY_EDITOR_DROP_STATE
		setEditorDropState((current) => {
			return areEditorDropStatesEqual(current, nextState) ? current : nextState
		})
	}, [])

	const cancelScheduledIndicatorUpdate = useCallback(() => {
		if (frameRef.current !== null) {
			window.cancelAnimationFrame(frameRef.current)
			frameRef.current = null
		}
	}, [])

	const scheduleEditorDropState = useCallback(
		(point: Point | null) => {
			lastPointerRef.current = point

			if (frameRef.current !== null) {
				return
			}

			frameRef.current = window.requestAnimationFrame(() => {
				frameRef.current = null
				applyEditorDropState(lastPointerRef.current)
			})
		},
		[applyEditorDropState],
	)

	const resetEditorDropState = useCallback(() => {
		cancelScheduledIndicatorUpdate()
		lastPointerRef.current = null
		setEditorDropState(EMPTY_EDITOR_DROP_STATE)
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

			scheduleEditorDropState(lastPointerRef.current)
		}

		window.addEventListener("scroll", handleScroll, true)
		return () => {
			window.removeEventListener("scroll", handleScroll, true)
		}
	}, [scheduleEditorDropState])

	const startDragging = useCallback(
		(point: Point | null) => {
			isDraggingRef.current = true
			scheduleEditorDropState(point)
		},
		[scheduleEditorDropState],
	)

	const updateDragging = useCallback(
		(point: Point | null) => {
			scheduleEditorDropState(point)
		},
		[scheduleEditorDropState],
	)

	const completeDragging = useCallback(
		(point: Point | null) => {
			const finalPoint = point ?? lastPointerRef.current
			cancelScheduledIndicatorUpdate()
			const finalState = finalPoint
				? computeEditorDropState(finalPoint)
				: EMPTY_EDITOR_DROP_STATE
			const syntheticTarget = finalState.indicator?.targetData ?? null
			isDraggingRef.current = false
			resetEditorDropState()
			return {
				syntheticTarget,
				isPointerInEditor: finalState.isPointerInEditor,
			}
		},
		[cancelScheduledIndicatorUpdate, resetEditorDropState],
	)

	return {
		editorDropIndicator: editorDropState.indicator,
		isPointerInEditor: editorDropState.isPointerInEditor,
		startDragging,
		updateDragging,
		completeDragging,
	}
}
