function getNavigatorPlatform(): string {
	const navigatorLike = globalThis.navigator
	if (!navigatorLike) {
		return ""
	}

	const userAgentDataPlatform =
		"userAgentData" in navigatorLike
			? (
					navigatorLike as Navigator & {
						userAgentData?: { platform?: string }
					}
				).userAgentData?.platform
			: undefined

	return userAgentDataPlatform ?? navigatorLike.platform ?? ""
}

export function isMac(): boolean {
	return /mac/i.test(getNavigatorPlatform())
}
