import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@mdit/ui/components/field"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@mdit/ui/components/select"
import { Switch } from "@mdit/ui/components/switch"
import { Monitor, Moon, Sun } from "lucide-react"
import { useShallow } from "zustand/shallow"
import { HotkeyKbd } from "@/components/hotkeys/hotkey-kbd"
import { useTheme } from "@/contexts/theme-context"
import { useStore } from "@/store"

export function PreferencesTab() {
	const { theme, setTheme } = useTheme()
	const {
		chatPanelBetaEnabled,
		setChatPanelBetaEnabled,
		toggleChatPanelHotkey,
	} = useStore(
		useShallow((state) => ({
			chatPanelBetaEnabled: state.chatPanelBetaEnabled,
			setChatPanelBetaEnabled: state.setChatPanelBetaEnabled,
			toggleChatPanelHotkey: state.hotkeys["toggle-chat-panel"],
		})),
	)

	const themeOptions: Array<{
		value: "light" | "dark" | "system"
		label: string
		icon?: React.ReactNode
	}> = [
		{ value: "light", label: "Light", icon: <Sun /> },
		{ value: "dark", label: "Dark", icon: <Moon /> },
		{ value: "system", label: "System", icon: <Monitor /> },
	]

	return (
		<div className="flex-1 overflow-y-auto p-12">
			<FieldSet>
				<FieldLegend>Preferences</FieldLegend>
				<FieldDescription>Customize your Mdit experience</FieldDescription>
				<FieldGroup>
					<Field orientation="horizontal">
						<FieldContent>
							<FieldLabel>Appearance</FieldLabel>
							<FieldDescription>
								Choose how you want Mdit to look
							</FieldDescription>
						</FieldContent>
						<Select
							value={theme}
							onValueChange={(value) =>
								setTheme(value as "light" | "dark" | "system")
							}
						>
							<SelectTrigger className="w-32">
								<SelectValue />
							</SelectTrigger>
							<SelectContent align="end">
								{themeOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.icon}
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				</FieldGroup>
			</FieldSet>

			<FieldSet className="mt-8">
				<FieldLegend>Beta</FieldLegend>
				<FieldDescription>
					Experimental features with agent-powered workflows.
				</FieldDescription>
				<FieldGroup>
					<Field orientation="horizontal">
						<FieldContent>
							<FieldLabel>Agent Chat Panel</FieldLabel>
							<FieldDescription>
								Enable a right-side chat panel that can request editor edit and
								file explorer access permissions.
								{toggleChatPanelHotkey.length > 0 ? (
									<>
										<span>Show or hide the panel with</span>
										<HotkeyKbd
											className="mx-1"
											binding={toggleChatPanelHotkey}
										/>
										<span>Customize under Hotkeys.</span>
									</>
								) : (
									<span>
										Assign a shortcut under Hotkeys to show or hide the panel.
									</span>
								)}
							</FieldDescription>
						</FieldContent>
						<Switch
							checked={chatPanelBetaEnabled}
							onCheckedChange={setChatPanelBetaEnabled}
						/>
					</Field>
				</FieldGroup>
			</FieldSet>
		</div>
	)
}
