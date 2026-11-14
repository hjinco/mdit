type HoverableZone = {
	onLeave?: () => void
	setIsOver?: (v: boolean) => void
}

export function resetCurrentDropZone<
	TZone extends HoverableZone,
	TRef extends { current: string | null },
>(zones: Map<string, TZone>, currentZoneIdRef: TRef) {
	const currentId = currentZoneIdRef.current
	if (!currentId) {
		return
	}

	const currentZone = zones.get(currentId)
	currentZone?.onLeave?.()
	currentZone?.setIsOver?.(false)
	currentZoneIdRef.current = null
}
