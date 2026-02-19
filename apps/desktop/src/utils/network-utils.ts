import { fetch } from "@tauri-apps/plugin-http"

/**
 * Checks if there is actual internet connectivity by making a lightweight request.
 * This is more reliable than navigator.onLine which only checks network interface status.
 *
 * @param timeoutMs - Timeout in milliseconds (default: 3000)
 * @returns Promise<boolean> - true if internet is available, false otherwise
 */
export async function checkInternetConnectivity(
	timeoutMs = 3000,
): Promise<boolean> {
	// Try Google's generate_204 endpoint first, then fallback to example.com
	const checkUrls = [
		"https://www.google.com/generate_204",
		"https://example.com",
	]

	for (const checkUrl of checkUrls) {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
		try {
			const response = await fetch(checkUrl, {
				method: "HEAD",
				signal: controller.signal,
				cache: "no-cache",
			})

			// Consider 2xx and 3xx status codes as successful connectivity
			if (response.status >= 200 && response.status < 400) {
				return true
			}
		} catch {
			// Try next URL if this one fails
		} finally {
			clearTimeout(timeoutId)
		}
	}

	// All endpoints failed - no internet connectivity
	return false
}
