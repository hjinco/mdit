import type { ApiKeyProviderId, ProviderId } from "@mdit/ai"
import { openUrl } from "@tauri-apps/plugin-opener"
import { useMemo, useState } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import { useOllamaModelRefresh } from "../shared/use-ollama-model-refresh"
import {
	buildChatModelSelectOptions,
	handleChatModelSelectChange,
	resolveSelectedChatModelSelectValue,
} from "./ai-chat-model"
import { AIModelsSection } from "./ai-models-section"
import {
	buildProviderModels,
	getCredentialProviderDefinitions,
	hasConnectedProviderModels,
} from "./ai-provider-state"
import { AIProvidersSection } from "./ai-providers-section"

export function AITab() {
	const {
		connectedProviders,
		apiModels,
		ollamaCompletionModels,
		enabledChatModels,
		chatConfig,
		connectProvider,
		connectCodexOAuth,
		disconnectProvider,
		fetchOllamaModels,
		toggleModelEnabled,
		selectModel,
	} = useStore(
		useShallow((state) => ({
			connectedProviders: state.connectedProviders,
			apiModels: state.apiModels,
			ollamaCompletionModels: state.ollamaCompletionModels,
			enabledChatModels: state.enabledChatModels,
			chatConfig: state.chatConfig,
			connectProvider: state.connectProvider,
			connectCodexOAuth: state.connectCodexOAuth,
			disconnectProvider: state.disconnectProvider,
			fetchOllamaModels: state.fetchOllamaModels,
			toggleModelEnabled: state.toggleModelEnabled,
			selectModel: state.selectModel,
		})),
	)
	const [providerBusy, setProviderBusy] = useState<
		Partial<Record<ProviderId, boolean>>
	>({})
	const { isRefreshingModels, refreshOllamaModels } =
		useOllamaModelRefresh(fetchOllamaModels)

	const runWithBusy = async (
		provider: ProviderId,
		action: () => Promise<void>,
	) => {
		setProviderBusy((prev) => ({ ...prev, [provider]: true }))
		try {
			await action()
		} catch (error) {
			console.error(`Failed to process provider action (${provider}):`, error)
		} finally {
			setProviderBusy((prev) => ({ ...prev, [provider]: false }))
		}
	}

	const providerModels = useMemo(
		() => buildProviderModels(apiModels, ollamaCompletionModels),
		[apiModels, ollamaCompletionModels],
	)
	const hasConnectedProviders = useMemo(
		() =>
			hasConnectedProviderModels(connectedProviders, ollamaCompletionModels),
		[connectedProviders, ollamaCompletionModels],
	)
	const selectedChatModelValue = useMemo(
		() => resolveSelectedChatModelSelectValue(enabledChatModels, chatConfig),
		[enabledChatModels, chatConfig],
	)
	const chatModelSelectOptions = useMemo(
		() => buildChatModelSelectOptions(enabledChatModels),
		[enabledChatModels],
	)
	const selectedChatModelLabel = selectedChatModelValue
		? (chatConfig?.model ?? null)
		: null
	const credentialProviderDefinitions = useMemo(
		() => getCredentialProviderDefinitions(),
		[],
	)

	const connectWithApiKey = async (
		targetProvider: ApiKeyProviderId,
		apiKey: string,
	) => {
		await runWithBusy(targetProvider, async () => {
			await connectProvider(targetProvider, apiKey)
		})
	}

	const disconnect = async (targetProvider: ProviderId) => {
		await runWithBusy(targetProvider, async () => {
			await disconnectProvider(targetProvider)
		})
	}

	const connectOAuth = async (targetProvider: ProviderId) => {
		await runWithBusy(targetProvider, async () => {
			await connectCodexOAuth()
		})
	}

	return (
		<div className="flex-1 overflow-y-auto px-12 pt-12 pb-24">
			<AIModelsSection
				enabledChatModels={enabledChatModels}
				providerModels={providerModels}
				connectedProviders={connectedProviders}
				hasConnectedProviders={hasConnectedProviders}
				selectedChatModelValue={selectedChatModelValue}
				selectedChatModelLabel={selectedChatModelLabel}
				chatModelSelectOptions={chatModelSelectOptions}
				onSelectChatModel={(value) => {
					if (!value) {
						return
					}
					void handleChatModelSelectChange(value, selectModel)
				}}
				onToggleModelEnabled={(provider, model, checked) =>
					toggleModelEnabled(provider, model, checked)
				}
			/>

			<AIProvidersSection
				credentialProviderDefinitions={credentialProviderDefinitions}
				connectedProviders={connectedProviders}
				providerBusy={providerBusy}
				isRefreshingModels={isRefreshingModels}
				onOpenSettingsUrl={(url) => {
					void openUrl(url)
				}}
				onConnectOAuth={connectOAuth}
				onConnectProvider={connectWithApiKey}
				onDisconnectProvider={disconnect}
				onRefreshOllamaModels={refreshOllamaModels}
			/>
		</div>
	)
}
