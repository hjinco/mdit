import { AI_PROVIDER_DEFINITIONS, type ChatProviderId } from "@mdit/ai"
import type { ChatConfig } from "@/store/ai-settings/ai-settings-slice"

type ChatModelOption = { provider: ChatProviderId; model: string }
type ChatModelSelectOption = ChatModelOption & { value: string }

function isChatProviderId(value: string): value is ChatProviderId {
	return Object.hasOwn(AI_PROVIDER_DEFINITIONS, value)
}

export function buildChatModelSelectValue(
	provider: ChatProviderId,
	model: string,
): string {
	return `${provider}|${model}`
}

export function buildChatModelSelectOptions(
	enabledModels: ChatModelOption[],
): ChatModelSelectOption[] {
	return enabledModels.map(({ provider, model }) => ({
		provider,
		model,
		value: buildChatModelSelectValue(provider, model),
	}))
}

export function parseChatModelSelectValue(
	value: string,
): ChatModelOption | null {
	const separatorIndex = value.indexOf("|")
	if (separatorIndex <= 0) {
		return null
	}

	const provider = value.slice(0, separatorIndex)
	const model = value.slice(separatorIndex + 1)
	if (!model || !isChatProviderId(provider)) {
		return null
	}

	return {
		provider,
		model,
	}
}

export function resolveSelectedChatModelSelectValue(
	enabledModels: ChatModelOption[],
	chatConfig: ChatConfig | null,
): string | undefined {
	if (!chatConfig) {
		return undefined
	}

	const isEnabled = enabledModels.some(
		(item) =>
			item.provider === chatConfig.provider && item.model === chatConfig.model,
	)
	if (!isEnabled) {
		return undefined
	}

	return buildChatModelSelectValue(chatConfig.provider, chatConfig.model)
}

export async function handleChatModelSelectChange(
	value: string,
	onSelectModel: (provider: ChatProviderId, model: string) => Promise<void>,
): Promise<void> {
	const parsed = parseChatModelSelectValue(value)
	if (!parsed) {
		return
	}
	await onSelectModel(parsed.provider, parsed.model)
}
