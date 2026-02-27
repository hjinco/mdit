import { createLicenseCore, type LicenseApiPort } from "@mdit/license"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import { type LicenseSlice, prepareLicenseSlice } from "./license-slice"

type LocalStorageLike = Pick<
	Storage,
	"getItem" | "setItem" | "removeItem" | "clear" | "key"
> & {
	length: number
}

const ACTIVATION_ID_STORAGE_KEY = "license-activation-id"

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
	activateLicenseKey = vi.fn().mockResolvedValue({
		success: true,
		data: { id: "activation-id" },
	}),
	validateLicenseKey = vi.fn().mockResolvedValue({
		success: true,
		data: {} as any,
	}),
	deactivateLicenseKey = vi.fn().mockResolvedValue({
		success: true,
		data: undefined,
	}),
	runtimeConfigured = true,
}: {
	getLicenseKey?: () => Promise<string | null>
	getLegacyLicenseKey?: () => Promise<string | null>
	activateLicenseKey?: LicenseApiPort["activateLicenseKey"]
	validateLicenseKey?: LicenseApiPort["validateLicenseKey"]
	deactivateLicenseKey?: LicenseApiPort["deactivateLicenseKey"]
	runtimeConfigured?: boolean
} = {}) {
	const deps = {
		getLicenseKey,
		setLicenseKey: vi.fn().mockResolvedValue(undefined),
		deleteLicenseKey: vi.fn().mockResolvedValue(undefined),
		getLegacyLicenseKey,
		deleteLegacyLicenseKey: vi.fn().mockResolvedValue(undefined),
		getActivationId: vi.fn(() =>
			localStorage.getItem(ACTIVATION_ID_STORAGE_KEY),
		),
		setActivationId: vi.fn((id: string) =>
			localStorage.setItem(ACTIVATION_ID_STORAGE_KEY, id),
		),
		deleteActivationId: vi.fn(() =>
			localStorage.removeItem(ACTIVATION_ID_STORAGE_KEY),
		),
		activateLicenseKey,
		validateLicenseKey,
		deactivateLicenseKey,
		runtimeConfigured,
	}

	const licenseCore = createLicenseCore({
		storage: {
			getLicenseKey: deps.getLicenseKey,
			setLicenseKey: deps.setLicenseKey,
			deleteLicenseKey: deps.deleteLicenseKey,
			getLegacyLicenseKey: deps.getLegacyLicenseKey,
			deleteLegacyLicenseKey: deps.deleteLegacyLicenseKey,
			getActivationId: deps.getActivationId,
			setActivationId: deps.setActivationId,
			deleteActivationId: deps.deleteActivationId,
		},
		api: {
			activateLicenseKey: deps.activateLicenseKey,
			validateLicenseKey: deps.validateLicenseKey,
			deactivateLicenseKey: deps.deactivateLicenseKey,
		},
		runtime: {
			isConfigured: () => deps.runtimeConfigured,
		},
	})

	const createSlice = prepareLicenseSlice({ licenseCore })
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
		localStorage.setItem(ACTIVATION_ID_STORAGE_KEY, "activation-id")

		await store.getState().validateLicense("license-key", "activation-id")
		expect(store.getState().hasVerifiedLicense).toBe(true)

		await store.getState().deactivateLicense()

		expect(store.getState().status).toBe("invalid")
		expect(store.getState().hasVerifiedLicense).toBe(false)
		expect(localStorage.getItem(ACTIVATION_ID_STORAGE_KEY)).toBeNull()
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
		localStorage.setItem(ACTIVATION_ID_STORAGE_KEY, "activation-id")

		await store.getState().checkLicense()

		expect(deps.setLicenseKey).toHaveBeenCalledWith("legacy-license-key")
		expect(deps.deleteLegacyLicenseKey).toHaveBeenCalled()
		expect(validateLicenseKey).toHaveBeenCalledWith(
			"legacy-license-key",
			"activation-id",
		)
	})
})
