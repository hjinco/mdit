import { beforeEach, describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import { type LicenseSlice, prepareLicenseSlice } from "./license-slice"

type LocalStorageLike = Pick<
	Storage,
	"getItem" | "setItem" | "removeItem" | "clear" | "key"
> & {
	length: number
}

const ensureLocalStorage = () => {
	if (typeof globalThis.localStorage !== "undefined") return

	const store = new Map<string, string>()
	const localStorageShim: LocalStorageLike = {
		getItem: (key) => (store.has(key) ? store.get(key)! : null),
		setItem: (key, value) => {
			store.set(key, String(value))
		},
		removeItem: (key) => {
			store.delete(key)
		},
		clear: () => {
			store.clear()
		},
		key: (index) => Array.from(store.keys())[index] ?? null,
		get length() {
			return store.size
		},
	}

	globalThis.localStorage = localStorageShim as Storage
}

function createLicenseStore({
	getLicenseKey = vi.fn().mockResolvedValue("license-key"),
	getLegacyLicenseKey = vi.fn().mockResolvedValue(null),
	validateLicenseKey = vi.fn().mockResolvedValue({
		success: true,
		data: {} as any,
	}),
	deactivateLicenseKey = vi.fn().mockResolvedValue({
		success: true,
		data: undefined,
	}),
}: {
	getLicenseKey?: () => Promise<string | null>
	getLegacyLicenseKey?: () => Promise<string | null>
	validateLicenseKey?: (key: string, activationId: string) => Promise<any>
	deactivateLicenseKey?: (key: string, activationId: string) => Promise<any>
} = {}) {
	const deps = {
		getLicenseKey,
		setLicenseKey: vi.fn().mockResolvedValue(undefined),
		deleteLicenseKey: vi.fn().mockResolvedValue(undefined),
		getLegacyLicenseKey,
		deleteLegacyLicenseKey: vi.fn().mockResolvedValue(undefined),
		activateLicenseKey: vi.fn().mockResolvedValue({
			success: true,
			data: { id: "activation-id" },
		}),
		validateLicenseKey,
		deactivateLicenseKey,
	}

	const createSlice = prepareLicenseSlice(deps)
	const store = createStore<LicenseSlice>()((set, get, api) =>
		createSlice(set, get, api),
	)

	return { store, deps }
}

beforeEach(() => {
	ensureLocalStorage()
	localStorage.clear()
})

describe("license-slice hasVerifiedLicense", () => {
	it("defaults to false", () => {
		const { store } = createLicenseStore()

		expect(store.getState().hasVerifiedLicense).toBe(false)
	})

	it("becomes true when validation succeeds", async () => {
		const { store } = createLicenseStore()

		await store.getState().validateLicense("license-key", "activation-id")

		expect(store.getState().status).toBe("valid")
		expect(store.getState().hasVerifiedLicense).toBe(true)
	})

	it("becomes false when validation fails due to network/unavailable validation", async () => {
		const validateLicenseKey = vi
			.fn()
			.mockResolvedValueOnce({
				success: true,
				data: {} as any,
			})
			.mockResolvedValueOnce({
				success: false,
				error: { message: "network error" },
				isValidationError: false,
			})
		const { store } = createLicenseStore({ validateLicenseKey })

		await store.getState().validateLicense("license-key", "activation-id")
		expect(store.getState().hasVerifiedLicense).toBe(true)

		await store.getState().validateLicense("license-key", "activation-id")
		expect(store.getState().status).toBe("valid")
		expect(store.getState().hasVerifiedLicense).toBe(false)
	})

	it("becomes false when license is deactivated", async () => {
		const { store } = createLicenseStore()
		localStorage.setItem("license-activation-id", "activation-id")

		await store.getState().validateLicense("license-key", "activation-id")
		expect(store.getState().hasVerifiedLicense).toBe(true)

		await store.getState().deactivateLicense()

		expect(store.getState().status).toBe("invalid")
		expect(store.getState().hasVerifiedLicense).toBe(false)
		expect(localStorage.getItem("license-activation-id")).toBeNull()
	})

	it("migrates legacy license key when unified key is missing", async () => {
		const validateLicenseKey = vi.fn().mockResolvedValue({
			success: true,
			data: {} as any,
		})
		const { store, deps } = createLicenseStore({
			getLicenseKey: vi.fn().mockResolvedValue(null),
			getLegacyLicenseKey: vi.fn().mockResolvedValue("legacy-license-key"),
			validateLicenseKey,
		})
		localStorage.setItem("license-activation-id", "activation-id")
		const previousBaseUrl = import.meta.env.VITE_POLAR_API_BASE_URL
		const previousOrgId = import.meta.env.VITE_POLAR_ORGANIZATION_ID
		import.meta.env.VITE_POLAR_API_BASE_URL = "https://example.com"
		import.meta.env.VITE_POLAR_ORGANIZATION_ID = "org_123"

		try {
			await store.getState().checkLicense()
		} finally {
			import.meta.env.VITE_POLAR_API_BASE_URL = previousBaseUrl
			import.meta.env.VITE_POLAR_ORGANIZATION_ID = previousOrgId
		}

		expect(deps.setLicenseKey).toHaveBeenCalledWith("legacy-license-key")
		expect(deps.deleteLegacyLicenseKey).toHaveBeenCalled()
		expect(validateLicenseKey).toHaveBeenCalledWith(
			"legacy-license-key",
			"activation-id",
		)
	})
})
