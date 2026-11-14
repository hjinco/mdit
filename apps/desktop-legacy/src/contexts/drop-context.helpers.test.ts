import { describe, expect, it, vi } from "vitest"
import { resetCurrentDropZone } from "./drop-context.helpers"

describe("resetCurrentDropZone", () => {
	it("clears the active hover state without dropping registered zones", () => {
		const activeZone = {
			onLeave: vi.fn(),
			setIsOver: vi.fn(),
		}
		const siblingZone = {
			onLeave: vi.fn(),
			setIsOver: vi.fn(),
		}
		const zones = new Map([
			["active", activeZone],
			["sibling", siblingZone],
		])
		const currentZoneIdRef = { current: "active" }

		resetCurrentDropZone(zones, currentZoneIdRef)

		expect(activeZone.onLeave).toHaveBeenCalledOnce()
		expect(activeZone.setIsOver).toHaveBeenCalledWith(false)
		expect(currentZoneIdRef.current).toBeNull()
		expect([...zones.keys()]).toEqual(["active", "sibling"])
	})

	it("is a no-op when there is no active zone", () => {
		const zone = {
			onLeave: vi.fn(),
			setIsOver: vi.fn(),
		}
		const zones = new Map([["only", zone]])
		const currentZoneIdRef = { current: null }

		resetCurrentDropZone(zones, currentZoneIdRef)

		expect(zone.onLeave).not.toHaveBeenCalled()
		expect(zone.setIsOver).not.toHaveBeenCalled()
		expect([...zones.keys()]).toEqual(["only"])
	})
})
