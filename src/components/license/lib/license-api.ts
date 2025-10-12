const POLAR_API_BASE_URL = import.meta.env.VITE_POLAR_API_BASE_URL
const ORGANIZATION_ID = import.meta.env.VITE_POLAR_ORGANIZATION_ID

export type LicenseActivationResponse = {
  id: string
  license_key_id: string
  label: string
  meta: Record<string, unknown>
  created_at: string
  modified_at: string | null
  license_key: {
    id: string
    organization_id: string
    user_id: string
    benefit_id: string
    key: string
    display_key: string
    status: string
    limit_activations: number | null
    usage: number
    limit_usage: number | null
    validations: number
    last_validated_at: string | null
    expires_at: string | null
  }
}

export type LicenseValidationResponse = {
  id: string
  organization_id: string
  user_id: string
  benefit_id: string
  key: string
  display_key: string
  status: string
  limit_activations: number | null
  usage: number
  limit_usage: number | null
  validations: number
  last_validated_at: string
  expires_at: string | null
  activation?: {
    id: string
    license_key_id: string
    label: string
    meta: Record<string, unknown>
    created_at: string
    modified_at: string | null
  }
}

export type LicenseError = {
  message: string
  code?: string
}

export async function activateLicenseKey(
  key: string
): Promise<LicenseActivationResponse> {
  try {
    const response = await fetch(
      `${POLAR_API_BASE_URL}/customer-portal/license-keys/activate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: key.trim(),
          organization_id: ORGANIZATION_ID,
          label: `Mdit - ${new Date().toISOString()}`,
          meta: {
            platform: navigator.platform,
            user_agent: navigator.userAgent,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        errorData.detail ||
          errorData.message ||
          `Activation failed: ${response.status}`
      )
    }

    return await response.json()
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to activate license key')
  }
}

export async function validateLicenseKey(
  key: string,
  activationId: string
): Promise<LicenseValidationResponse> {
  try {
    const response = await fetch(
      `${POLAR_API_BASE_URL}/customer-portal/license-keys/validate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: key.trim(),
          organization_id: ORGANIZATION_ID,
          activation_id: activationId,
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        errorData.detail ||
          errorData.message ||
          `Validation failed: ${response.status}`
      )
    }

    return await response.json()
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to validate license key')
  }
}
