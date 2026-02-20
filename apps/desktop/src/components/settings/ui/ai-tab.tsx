import {
	AI_PROVIDER_DEFINITIONS,
	type ApiKeyProviderId,
	type ChatProviderId,
	CREDENTIAL_PROVIDER_IDS,
	type CredentialProviderId,
} from "@mdit/ai-auth"
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
import { Input } from "@mdit/ui/components/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@mdit/ui/components/select"
import { Switch } from "@mdit/ui/components/switch"
import { openUrl } from "@tauri-apps/plugin-opener"
import { ExternalLink } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

function isCredentialProviderId(value: string): value is CredentialProviderId {
	return (
		value === "google" ||
		value === "openai" ||
		value === "anthropic" ||
		value === "codex_oauth"
	)
}

export function AITab() {
	const {
		connectedProviders,
		apiModels,
		ollamaModels,
		enabledChatModels,
		connectProvider,
		connectCodexOAuth,
		disconnectProvider,
		fetchOllamaModels,
		renameConfig,
		selectRenameModel,
		clearRenameModel,
		toggleModelEnabled,
	} = useStore(
		useShallow((state) => ({
			connectedProviders: state.connectedProviders,
			apiModels: state.apiModels,
			ollamaModels: state.ollamaModels,
			enabledChatModels: state.enabledChatModels,
			connectProvider: state.connectProvider,
			connectCodexOAuth: state.connectCodexOAuth,
			disconnectProvider: state.disconnectProvider,
			fetchOllamaModels: state.fetchOllamaModels,
			renameConfig: state.renameConfig,
			selectRenameModel: state.selectRenameModel,
			clearRenameModel: state.clearRenameModel,
			toggleModelEnabled: state.toggleModelEnabled,
		})),
	)
	const [providerBusy, setProviderBusy] = useState<
		Partial<Record<CredentialProviderId, boolean>>
	>({})

	useEffect(() => {
		fetchOllamaModels()
	}, [fetchOllamaModels])

	const runWithBusy = async (
		provider: CredentialProviderId,
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

	const providersMap = useMemo((): Array<{
		provider: ChatProviderId
		models: string[]
	}> => {
		const credentialProviderModels = CREDENTIAL_PROVIDER_IDS.map((provider) => {
			return {
				provider,
				models: apiModels[provider] ?? [],
			}
		})

		return [
			...credentialProviderModels,
			{ provider: "ollama", models: ollamaModels },
		]
	}, [apiModels, ollamaModels])

	const renameOptions = useMemo(() => {
		const options: Array<{ value: string; label: string }> = []

		connectedProviders.forEach((provider) => {
			const models = apiModels[provider] ?? []
			models.forEach((model) => {
				options.push({
					value: `${provider}|${model}`,
					label: model,
				})
			})
		})

		ollamaModels.forEach((model) => {
			options.push({
				value: `ollama|${model}`,
				label: model,
			})
		})

		if (renameConfig) {
			const value = `${renameConfig.provider}|${renameConfig.model}`
			const exists = options.some((option) => option.value === value)
			if (!exists) {
				options.push({
					value,
					label: renameConfig.model,
				})
			}
		}

		return options.sort((a, b) => a.label.localeCompare(b.label))
	}, [connectedProviders, apiModels, ollamaModels, renameConfig])

	const renameSelectValue = renameConfig
		? `${renameConfig.provider}|${renameConfig.model}`
		: "__none__"

	const hasConnectedProviders = useMemo(() => {
		return connectedProviders.length > 0 || ollamaModels.length > 0
	}, [connectedProviders, ollamaModels])

	const credentialProviderDefinitions = useMemo(() => {
		return CREDENTIAL_PROVIDER_IDS.map(
			(providerId) => AI_PROVIDER_DEFINITIONS[providerId],
		)
	}, [])

	return (
		<div className="flex-1 overflow-y-auto px-12 pt-12 pb-24">
			<FieldSet className="border-b pb-8">
				<FieldLegend>AI Models</FieldLegend>
				<FieldDescription>Enable models from AI providers</FieldDescription>
				<div>
					<FieldLabel>Chat</FieldLabel>
					<FieldGroup className="gap-0 mt-2">
						{providersMap.map(({ provider, models }) => {
							const isConnected =
								provider === "ollama"
									? true
									: connectedProviders.includes(provider)

							if (!isConnected) return null

							return (
								<Field key={provider}>
									<FieldGroup className="gap-0">
										{models.length === 0 && provider === "ollama" ? (
											<div className="py-2 text-sm text-muted-foreground">
												No Ollama models available. Make sure Ollama is
												installed and running.
											</div>
										) : (
											models.map((model) => (
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
															(m) =>
																m.provider === provider && m.model === model,
														)}
														onCheckedChange={(checked) =>
															toggleModelEnabled(provider, model, checked)
														}
													/>
												</Field>
											))
										)}
									</FieldGroup>
								</Field>
							)
						})}
						{!hasConnectedProviders && (
							<div className="py-2 text-sm text-muted-foreground">
								No chat models available. Connect a provider to get started.
							</div>
						)}
						<FieldGroup className="gap-0 mt-6">
							<Field orientation="horizontal">
								<FieldLabel>Rename with AI</FieldLabel>
								<Select
									value={renameSelectValue}
									onValueChange={(value) => {
										if (value === "__none__") {
											clearRenameModel()
											return
										}
										const separatorIndex = value.indexOf("|")
										if (separatorIndex === -1) {
											clearRenameModel()
											return
										}
										const provider = value.slice(0, separatorIndex)
										const model = value.slice(separatorIndex + 1)
										if (!provider || !model) {
											clearRenameModel()
											return
										}
										if (provider === "ollama") {
											selectRenameModel(provider, model)
											return
										}
										if (isCredentialProviderId(provider)) {
											selectRenameModel(provider, model)
											return
										}
										clearRenameModel()
									}}
								>
									<SelectTrigger size="sm">
										<SelectValue placeholder="Select model" />
									</SelectTrigger>
									<SelectContent align="end">
										<SelectItem value="__none__">Disabled</SelectItem>
										{renameOptions.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						</FieldGroup>
					</FieldGroup>
				</div>
			</FieldSet>

			<FieldSet className="mt-8">
				<FieldLegend>Providers</FieldLegend>
				<FieldDescription>
					Connect to AI providers to enable their models
				</FieldDescription>
				<FieldGroup className="gap-2">
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
										openUrl(definition.settingsUrl)
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
													void runWithBusy(definition.id, async () => {
														await disconnectProvider(definition.id)
													})
													return
												}
												void runWithBusy(definition.id, async () => {
													await connectCodexOAuth()
												})
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
									<ConnectProvider
										provider={definition.id}
										isConnected={isConnected}
										isBusy={isBusy}
										onConnect={async (targetProvider, apiKey) => {
											await runWithBusy(targetProvider, async () => {
												await connectProvider(targetProvider, apiKey)
											})
										}}
										onDisconnect={async (targetProvider) => {
											await runWithBusy(targetProvider, async () => {
												await disconnectProvider(targetProvider)
											})
										}}
									/>
								)}
							</Field>
						)
					})}

					<Field orientation="vertical" className="mt-8">
						<FieldContent>
							<FieldLabel>Ollama</FieldLabel>
							<FieldDescription>
								Models are automatically fetched from your local Ollama instance
							</FieldDescription>
						</FieldContent>
						<FieldGroup className="gap-0 mt-2">
							{ollamaModels.length === 0 ? (
								<div className="py-2 text-sm text-muted-foreground">
									No Ollama models available. Make sure Ollama is installed and
									running.
								</div>
							) : (
								ollamaModels.map((model) => (
									<Field key={model} orientation="horizontal" className="py-2">
										<FieldContent>
											<FieldLabel className="text-xs">{model}</FieldLabel>
										</FieldContent>
									</Field>
								))
							)}
						</FieldGroup>
					</Field>
				</FieldGroup>
			</FieldSet>
		</div>
	)
}

interface ConnectProviderProps {
	provider: ApiKeyProviderId
	isConnected: boolean
	isBusy: boolean
	onConnect: (provider: ApiKeyProviderId, apiKey: string) => Promise<void>
	onDisconnect: (provider: ApiKeyProviderId) => Promise<void>
}

function ConnectProvider({
	provider,
	isConnected,
	isBusy,
	onConnect,
	onDisconnect,
}: ConnectProviderProps) {
	const inputRef = useRef<HTMLInputElement>(null)

	const handleConnect = async () => {
		if (isBusy) {
			return
		}
		if (isConnected) {
			await onDisconnect(provider)
			if (inputRef.current) {
				inputRef.current.value = ""
			}
			return
		}
		const apiKey = inputRef.current?.value.trim()
		if (apiKey) {
			await onConnect(provider, apiKey)
		}
	}

	return (
		<div className="flex items-center gap-2">
			<Input
				ref={inputRef}
				defaultValue={isConnected ? "****************" : undefined}
				type="password"
				placeholder="API Key"
				autoComplete="off"
				spellCheck="false"
				disabled={isBusy}
			/>
			<Button
				variant="outline"
				onClick={() => void handleConnect()}
				disabled={isBusy}
			>
				{isBusy ? "Processing..." : isConnected ? "Disconnect" : "Connect"}
			</Button>
		</div>
	)
}
