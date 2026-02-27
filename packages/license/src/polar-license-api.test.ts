import { describe, expect, it, vi } from "vitest"
import { createPolarLicenseApi } from "./polar-license-api"

function createResponse({
	ok,
	status,
	data,
}: {
	ok: boolean
	status: number
	data: unknown
}) {
	return {
		ok,
		status,
		json: vi.fn().mockResolvedValue(data),
	}
}

describe("polar-license-api", () => {
	it("activates a license key with trimmed key and client metadata", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			createResponse({
				ok: true,
				status: 200,
				data: { id: "activation-id" },
			}),
		)
		const api = createPolarLicenseApi({
			baseUrl: "https://polar.example.com",
			organizationId: "org_123",
			fetch: fetchMock,
			getClientMeta: () => ({
				platform: "MacIntel",
				userAgent: "test-agent",
			}),
		})

		const result = await api.activateLicenseKey("  license-key  ")

		expect(result).toEqual({
			success: true,
			data: { id: "activation-id" },
		})

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe(
			"https://polar.example.com/v1/customer-portal/license-keys/activate",
		)
		expect(init.method).toBe("POST")

		const payload = JSON.parse(init.body)
		expect(payload.key).toBe("license-key")
		expect(payload.organization_id).toBe("org_123")
		expect(payload.label).toContain("Mdit - ")
		expect(payload.meta).toEqual({
			platform: "MacIntel",
			user_agent: "test-agent",
		})
	})

	it("marks 4xx validate responses as validation errors", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			createResponse({
				ok: false,
				status: 422,
				data: { detail: "invalid license", code: "invalid_key" },
			}),
		)
		const api = createPolarLicenseApi({
			baseUrl: "https://polar.example.com",
			organizationId: "org_123",
			fetch: fetchMock,
		})

		const result = await api.validateLicenseKey("license-key", "activation-id")

		expect(result).toEqual({
			success: false,
			error: {
				message: "invalid license",
				code: "invalid_key",
			},
			isValidationError: true,
		})
	})

	it("does not parse JSON on successful deactivation", async () => {
		const json = vi.fn().mockResolvedValue({ unused: true })
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json,
		})
		const api = createPolarLicenseApi({
			baseUrl: "https://polar.example.com",
			organizationId: "org_123",
			fetch: fetchMock,
		})

		const result = await api.deactivateLicenseKey(
			"license-key",
			"activation-id",
		)

		expect(result).toEqual({ success: true, data: undefined })
		expect(json).not.toHaveBeenCalled()
	})

	it("returns non-validation error for network failures", async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error("network down"))
		const api = createPolarLicenseApi({
			baseUrl: "https://polar.example.com",
			organizationId: "org_123",
			fetch: fetchMock,
		})

		const result = await api.activateLicenseKey("license-key")

		expect(result).toEqual({
			success: false,
			error: { message: "network down" },
			isValidationError: false,
		})
	})
})
