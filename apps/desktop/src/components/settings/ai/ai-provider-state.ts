import {
	AI_PROVIDER_DEFINITIONS,
	type ChatProviderId,
	CREDENTIAL_PROVIDER_IDS,
	type ProviderId,
} from "@mdit/ai"

type CredentialProviderId = (typeof CREDENTIAL_PROVIDER_IDS)[number]

export type ApiModelsByProvider = Partial<
	Record<CredentialProviderId, string[]>
>

export type ProviderModels = {
	provider: ChatProviderId
	models: string[]
}

export type CredentialProviderDefinition =
	(typeof AI_PROVIDER_DEFINITIONS)[CredentialProviderId]

export function buildProviderModels(
	apiModels: ApiModelsByProvider,
	ollamaCompletionModels: string[],
): ProviderModels[] {
	return [
		...CREDENTIAL_PROVIDER_IDS.map((provider) => ({
			provider,
			models: apiModels[provider] ?? [],
		})),
		{ provider: "ollama", models: ollamaCompletionModels },
	]
}

export function hasConnectedProviderModels(
	connectedProviders: ProviderId[],
	ollamaCompletionModels: string[],
): boolean {
	return connectedProviders.length > 0 || ollamaCompletionModels.length > 0
}

export function getCredentialProviderDefinitions(): CredentialProviderDefinition[] {
	return CREDENTIAL_PROVIDER_IDS.map(
		(providerId) => AI_PROVIDER_DEFINITIONS[providerId],
	)
}
