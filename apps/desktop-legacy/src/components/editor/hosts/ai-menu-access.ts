export const getDesktopAIMenuAccess = (windowLabel: string | null) => ({
	isLicenseValid: true,
	canOpenModelSettings: windowLabel === "main",
})
