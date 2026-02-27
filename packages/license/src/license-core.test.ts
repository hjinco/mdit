import { describe, expect, it, vi } from "vitest"
import { createLicenseCore } from "./license-core"
import type {
	LicenseApiPort,
	LicenseRuntimePort,
	LicenseStoragePort,
} from "./ports"

function createHarness({
	licenseKey = "license-key",
	legacyLicenseKey = null,
	activationId = "activation-id",
	isConfigured = true,
	activateLicenseKey = vi.fn().mockResolvedValue({
		success: true,
		data: { id: "activation-id" },
	}),
	validateLicenseKey = vi.fn().mockResolvedValue({
		success: true,
		data: { id: "license-id" },
	}),
	deactivateLicenseKey = vi.fn().mockResolvedValue({
		success: true,
		data: undefined,
	}),
}: {
	licenseKey?: string | null
	legacyLicenseKey?: string | null
	activationId?: string | null
	isConfigured?: boolean
	activateLicenseKey?: LicenseApiPort["activateLicenseKey"]
	validateLicenseKey?: LicenseApiPort["validateLicenseKey"]
	deactivateLicenseKey?: LicenseApiPort["deactivateLicenseKey"]
} = {}) {
	const refs = {
		licenseKey,
		legacyLicenseKey,
		activationId,
	}

	const storage: LicenseStoragePort = {
		getLicenseKey: vi.fn(async () => refs.licenseKey),
		setLicenseKey: vi.fn(async (key: string) => {
			refs.licenseKey = key
		}),
		deleteLicenseKey: vi.fn(async () => {
			refs.licenseKey = null
		}),
		getLegacyLicenseKey: vi.fn(async () => refs.legacyLicenseKey),
		deleteLegacyLicenseKey: vi.fn(async () => {
			refs.legacyLicenseKey = null
		}),
		getActivationId: vi.fn(() => refs.activationId),
		setActivationId: vi.fn((id: string) => {
			refs.activationId = id
		}),
		deleteActivationId: vi.fn(() => {
			refs.activationId = null
		}),
	}

	const api: LicenseApiPort = {
		activateLicenseKey,
		validateLicenseKey,
		deactivateLicenseKey,
	}

	const runtime: LicenseRuntimePort = {
		isConfigured: vi.fn(() => isConfigured),
	}

	return {
		core: createLicenseCore({ storage, api, runtime }),
		storage,
		api,
		runtime,
		refs,
	}
}

describe("license-core", () => {
	it("returns valid state with verification when runtime is not configured", async () => {
		const { core, api } = createHarness({ isConfigured: false })

		const state = await core.checkLicense({
			status: "validating",
			hasVerifiedLicense: false,
			error: null,
		})

		expect(state).toEqual({
			status: "valid",
			hasVerifiedLicense: true,
			error: null,
		})
		expect(api.activateLicenseKey).not.toHaveBeenCalled()
		expect(api.validateLicenseKey).not.toHaveBeenCalled()
	})

	it("returns invalid state when no license key is present", async () => {
		const { core } = createHarness({
			licenseKey: null,
			legacyLicenseKey: null,
		})

		const state = await core.checkLicense({
			status: "validating",
			hasVerifiedLicense: false,
			error: null,
		})

		expect(state).toEqual({
			status: "invalid",
			hasVerifiedLicense: false,
			error: null,
		})
	})

	it("migrates legacy key when unified key is missing", async () => {
		const validateLicenseKey = vi.fn().mockResolvedValue({
			success: true,
			data: { id: "license-id" },
		})
		const { core, storage } = createHarness({
			licenseKey: null,
			legacyLicenseKey: "legacy-license-key",
			activationId: "activation-id",
			validateLicenseKey,
		})

		const state = await core.checkLicense({
			status: "validating",
			hasVerifiedLicense: false,
			error: null,
		})

		expect(state).toEqual({
			status: "valid",
			hasVerifiedLicense: true,
			error: null,
		})
		expect(storage.setLicenseKey).toHaveBeenCalledWith("legacy-license-key")
		expect(storage.deleteLegacyLicenseKey).toHaveBeenCalled()
		expect(validateLicenseKey).toHaveBeenCalledWith(
			"legacy-license-key",
			"activation-id",
		)
	})

	it("activates before validating when activation id is missing", async () => {
		const activateLicenseKey = vi.fn().mockResolvedValue({
			success: true,
			data: { id: "new-activation-id" },
		})
		const validateLicenseKey = vi.fn().mockResolvedValue({
			success: true,
			data: { id: "license-id" },
		})
		const { core, storage } = createHarness({
			activationId: null,
			activateLicenseKey,
			validateLicenseKey,
		})

		const state = await core.checkLicense({
			status: "validating",
			hasVerifiedLicense: false,
			error: null,
		})

		expect(state).toEqual({
			status: "valid",
			hasVerifiedLicense: true,
			error: null,
		})
		expect(storage.setActivationId).toHaveBeenCalledWith("new-activation-id")
		expect(validateLicenseKey).toHaveBeenCalledWith(
			"license-key",
			"new-activation-id",
		)
	})

	it("returns invalid state and clears stored key data on validation error", async () => {
		const { core, storage } = createHarness({
			validateLicenseKey: vi.fn().mockResolvedValue({
				success: false,
				error: { message: "invalid" },
				isValidationError: true,
			}),
		})

		const result = await core.validateLicense("license-key", "activation-id")

		expect(result).toEqual({
			state: {
				status: "invalid",
				hasVerifiedLicense: false,
				error: "invalid",
			},
			data: null,
		})
		expect(storage.deleteLicenseKey).toHaveBeenCalled()
		expect(storage.deleteActivationId).toHaveBeenCalled()
	})

	it("returns valid but unverified state when validation is unavailable", async () => {
		const { core, storage } = createHarness({
			validateLicenseKey: vi.fn().mockResolvedValue({
				success: false,
				error: { message: "network" },
				isValidationError: false,
			}),
		})

		const result = await core.validateLicense("license-key", "activation-id")

		expect(result).toEqual({
			state: {
				status: "valid",
				hasVerifiedLicense: false,
				error: null,
			},
			data: null,
		})
		expect(storage.deleteLicenseKey).not.toHaveBeenCalled()
		expect(storage.deleteActivationId).not.toHaveBeenCalled()
	})

	it("registers and validates a new key", async () => {
		const { core, storage, refs } = createHarness({
			activationId: null,
			activateLicenseKey: vi.fn().mockResolvedValue({
				success: true,
				data: { id: "register-activation-id" },
			}),
			validateLicenseKey: vi.fn().mockResolvedValue({
				success: true,
				data: { id: "license-id" },
			}),
		})

		const state = await core.registerLicenseKey("registered-key")

		expect(state).toEqual({
			status: "valid",
			hasVerifiedLicense: true,
			error: null,
		})
		expect(storage.setLicenseKey).toHaveBeenCalledWith("registered-key")
		expect(storage.setActivationId).toHaveBeenCalledWith(
			"register-activation-id",
		)
		expect(refs.licenseKey).toBe("registered-key")
	})

	it("returns invalid state when activation fails during register", async () => {
		const { core, storage } = createHarness({
			activateLicenseKey: vi.fn().mockResolvedValue({
				success: false,
				error: { message: "activation failed" },
				isValidationError: true,
			}),
		})

		const state = await core.registerLicenseKey("registered-key")

		expect(state).toEqual({
			status: "invalid",
			hasVerifiedLicense: false,
			error: "activation failed",
		})
		expect(storage.setLicenseKey).not.toHaveBeenCalled()
	})

	it("returns valid but unverified state when register validation is unavailable", async () => {
		const { core, storage } = createHarness({
			activateLicenseKey: vi.fn().mockResolvedValue({
				success: true,
				data: { id: "activation-id" },
			}),
			validateLicenseKey: vi.fn().mockResolvedValue({
				success: false,
				error: { message: "network" },
				isValidationError: false,
			}),
		})

		const state = await core.registerLicenseKey("registered-key")

		expect(state).toEqual({
			status: "valid",
			hasVerifiedLicense: false,
			error: null,
		})
		expect(storage.setLicenseKey).toHaveBeenCalledWith("registered-key")
		expect(storage.deleteLicenseKey).not.toHaveBeenCalled()
	})

	it("deactivates and clears stored key data", async () => {
		const { core, storage, refs } = createHarness({
			licenseKey: "registered-key",
			activationId: "activation-id",
		})

		const state = await core.deactivateLicense()

		expect(state).toEqual({
			status: "invalid",
			hasVerifiedLicense: false,
			error: null,
		})
		expect(storage.deleteLicenseKey).toHaveBeenCalled()
		expect(storage.deleteActivationId).toHaveBeenCalled()
		expect(refs.licenseKey).toBeNull()
		expect(refs.activationId).toBeNull()
	})

	it("returns invalid state and clears key data on deactivation validation error", async () => {
		const { core, storage } = createHarness({
			deactivateLicenseKey: vi.fn().mockResolvedValue({
				success: false,
				error: { message: "activation not found" },
				isValidationError: true,
			}),
		})

		const state = await core.deactivateLicense()

		expect(state).toEqual({
			status: "invalid",
			hasVerifiedLicense: false,
			error: "activation not found",
		})
		expect(storage.deleteLicenseKey).toHaveBeenCalled()
		expect(storage.deleteActivationId).toHaveBeenCalled()
	})

	it("returns valid but unverified state when deactivation cannot be verified", async () => {
		const { core, storage } = createHarness({
			deactivateLicenseKey: vi.fn().mockResolvedValue({
				success: false,
				error: { message: "network" },
				isValidationError: false,
			}),
		})

		const state = await core.deactivateLicense()

		expect(state).toEqual({
			status: "valid",
			hasVerifiedLicense: false,
			error: "network",
		})
		expect(storage.deleteLicenseKey).not.toHaveBeenCalled()
		expect(storage.deleteActivationId).not.toHaveBeenCalled()
	})

	it("returns valid but unverified state when deactivation lacks key data", async () => {
		const { core } = createHarness({
			licenseKey: null,
			activationId: null,
		})

		const state = await core.deactivateLicense()

		expect(state).toEqual({
			status: "valid",
			hasVerifiedLicense: false,
			error: "No license key or activation ID found",
		})
	})
})
