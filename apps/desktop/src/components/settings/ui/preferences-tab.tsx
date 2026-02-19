import { Monitor, Moon, Sun } from "lucide-react"
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { useTheme } from "@/contexts/theme-context"

export function PreferencesTab() {
	const { theme, setTheme } = useTheme()

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
							<SelectTrigger size="sm">
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
		</div>
	)
}
