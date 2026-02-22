import { Button } from "@mdit/ui/components/button"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

export function LicenseKeyButton() {
	const { status, openSettingsWithTab } = useStore(
		useShallow((s) => ({
			status: s.status,
			openSettingsWithTab: s.openSettingsWithTab,
		})),
	)

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
