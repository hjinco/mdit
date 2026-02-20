import { Button } from "@mdit/ui/components/button"
import { useEffect } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import { checkInternetConnectivity } from "@/utils/network-utils"

export function LicenseKeyButton() {
	const { status, checkLicense, openSettingsWithTab } = useStore(
		useShallow((s) => ({
			status: s.status,
			checkLicense: s.checkLicense,
			openSettingsWithTab: s.openSettingsWithTab,
		})),
	)

	useEffect(() => {
		const checkAndValidateLicense = async () => {
			const isOnline = await checkInternetConnectivity()
			if (isOnline) {
				checkLicense()
			}
		}

		checkAndValidateLicense()

		window.addEventListener("online", checkAndValidateLicense)
		return () => {
			window.removeEventListener("online", checkAndValidateLicense)
		}
	}, [checkLicense])

	if (status !== "invalid") {
		return null
	}

	return (
		<Button
			variant="ghost"
			className="text-xs h-5 px-2 text-muted-foreground hover:bg-transparent dark:hover:bg-transparent hover:text-foreground"
			onClick={() => openSettingsWithTab("license")}
		>
			License Key
		</Button>
	)
}
