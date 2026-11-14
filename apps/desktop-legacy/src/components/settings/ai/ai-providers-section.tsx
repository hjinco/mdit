import type { ApiKeyProviderId, ProviderId } from "@mdit/ai"
import { Button } from "@mdit/ui/components/button"
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@mdit/ui/components/field"
import { ExternalLink, Loader2Icon, RefreshCcwIcon } from "lucide-react"
import { AIConnectProviderField } from "./ai-connect-provider-field"
import type { CredentialProviderDefinition } from "./ai-provider-state"

interface AIProvidersSectionProps {
	credentialProviderDefinitions: CredentialProviderDefinition[]
	connectedProviders: ProviderId[]
	providerBusy: Partial<Record<ProviderId, boolean>>
	isRefreshingModels: boolean
	onOpenSettingsUrl: (url: string) => void
	onConnectOAuth: (provider: ProviderId) => Promise<void>
	onConnectProvider: (
		provider: ApiKeyProviderId,
		apiKey: string,
	) => Promise<void>
	onDisconnectProvider: (provider: ProviderId) => Promise<void>
	onRefreshOllamaModels: () => Promise<void>
}

export function AIProvidersSection({
	credentialProviderDefinitions,
	connectedProviders,
	providerBusy,
	isRefreshingModels,
	onOpenSettingsUrl,
	onConnectOAuth,
	onConnectProvider,
	onDisconnectProvider,
	onRefreshOllamaModels,
}: AIProvidersSectionProps) {
	return (
		<FieldSet className="mt-8">
			<FieldLegend>Providers</FieldLegend>
			<FieldDescription>
				Connect to AI providers to enable their models
			</FieldDescription>
			<FieldGroup>
				{credentialProviderDefinitions.map((definition) => {
					const isConnected = connectedProviders.includes(definition.id)
					const isBusy = Boolean(providerBusy[definition.id])

					return (
						<Field key={definition.id}>
							<FieldLabel
								className={
									definition.settingsUrl
										? "cursor-pointer hover:text-blue-500"
										: undefined
								}
								onClick={() => {
									if (!definition.settingsUrl) {
										return
									}
									onOpenSettingsUrl(definition.settingsUrl)
								}}
							>
								{definition.label}
								{definition.settingsUrl && (
									<ExternalLink className="size-3 inline" />
								)}
							</FieldLabel>

							{definition.authKind === "oauth" ? (
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										disabled={isBusy}
										onClick={() => {
											if (isConnected) {
												void onDisconnectProvider(definition.id)
												return
											}
											void onConnectOAuth(definition.id)
										}}
									>
										{isBusy
											? "Processing..."
											: isConnected
												? "Disconnect"
												: "Connect"}
									</Button>
								</div>
							) : (
								<AIConnectProviderField
									provider={definition.id as ApiKeyProviderId}
									isConnected={isConnected}
									isBusy={isBusy}
									onConnect={onConnectProvider}
									onDisconnect={async (provider) =>
										onDisconnectProvider(provider)
									}
								/>
							)}
						</Field>
					)
				})}

				<Field orientation="horizontal" className="mt-8">
					<FieldContent>
						<FieldLabel>Ollama</FieldLabel>
						<FieldDescription>
							Fetch models from your local Ollama instance when needed
						</FieldDescription>
					</FieldContent>
					<Button
						variant="outline"
						disabled={isRefreshingModels}
						onClick={() => void onRefreshOllamaModels()}
					>
						{isRefreshingModels ? (
							<Loader2Icon className="size-4 animate-spin" />
						) : (
							<RefreshCcwIcon className="size-4" />
						)}
						Refresh
					</Button>
				</Field>
			</FieldGroup>
		</FieldSet>
	)
}
