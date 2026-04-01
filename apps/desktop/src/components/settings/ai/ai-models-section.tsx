import type { ChatProviderId, ProviderId } from "@mdit/ai"
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
} from "@mdit/ui/components/select"
import { Switch } from "@mdit/ui/components/switch"
import type { ProviderModels } from "./ai-provider-state"

type EnabledChatModel = {
	provider: ChatProviderId
	model: string
}

type ChatModelSelectOption = {
	model: string
	value: string
}

interface AIModelsSectionProps {
	enabledChatModels: EnabledChatModel[]
	providerModels: ProviderModels[]
	connectedProviders: ProviderId[]
	hasConnectedProviders: boolean
	selectedChatModelValue: string | undefined
	selectedChatModelLabel: string | null
	chatModelSelectOptions: ChatModelSelectOption[]
	onSelectChatModel: (value: string | null) => void
	onToggleModelEnabled: (
		provider: ChatProviderId,
		model: string,
		checked: boolean,
	) => void
}

export function AIModelsSection({
	enabledChatModels,
	providerModels,
	connectedProviders,
	hasConnectedProviders,
	selectedChatModelValue,
	selectedChatModelLabel,
	chatModelSelectOptions,
	onSelectChatModel,
	onToggleModelEnabled,
}: AIModelsSectionProps) {
	return (
		<FieldSet className="border-b pb-8">
			<FieldLegend>AI</FieldLegend>
			<FieldDescription>Enable models from AI providers</FieldDescription>
			<div>
				<FieldGroup className="gap-0 mt-2">
					<Field orientation="horizontal" className="pt-2 pb-8">
						<FieldContent>
							<FieldLabel>Model</FieldLabel>
							<FieldDescription>
								Select the model to use for AI
							</FieldDescription>
						</FieldContent>
						<Select
							value={selectedChatModelValue}
							onValueChange={onSelectChatModel}
							disabled={enabledChatModels.length === 0}
						>
							<SelectTrigger className="w-[240px]">
								{selectedChatModelLabel ?? (
									<span className="text-muted-foreground">
										{enabledChatModels.length === 0
											? "No enabled models"
											: "Select model"}
									</span>
								)}
							</SelectTrigger>
							<SelectContent align="end">
								{chatModelSelectOptions.map(({ model, value }) => (
									<SelectItem key={value} value={value}>
										{model}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					{providerModels.map(({ provider, models }) => {
						const isConnected =
							provider === "ollama"
								? true
								: connectedProviders.includes(provider)

						if (!isConnected) {
							return null
						}

						return (
							<Field key={provider}>
								<FieldGroup className="gap-0">
									{models.map((model) => (
										<Field
											key={`${provider}-${model}`}
											orientation="horizontal"
											className="py-2"
										>
											<FieldContent className="group flex-row justify-between">
												<FieldLabel
													htmlFor={`${provider}-${model}`}
													className="text-xs"
												>
													{model}
												</FieldLabel>
											</FieldContent>
											<Switch
												id={`${provider}-${model}`}
												checked={enabledChatModels.some(
													(item) =>
														item.provider === provider && item.model === model,
												)}
												onCheckedChange={(checked) =>
													onToggleModelEnabled(provider, model, checked)
												}
											/>
										</Field>
									))}
								</FieldGroup>
							</Field>
						)
					})}
					{!hasConnectedProviders && (
						<div className="py-2 text-sm text-muted-foreground">
							No chat models available. Connect a provider to get started.
						</div>
					)}
				</FieldGroup>
			</div>
		</FieldSet>
	)
}
