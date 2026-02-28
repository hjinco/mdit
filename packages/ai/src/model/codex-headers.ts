import type { AIChatConfig, AICodexModelOptions } from "../shared/chat-config"

export function buildCodexHeaders({
	chatConfig,
	codex,
}: {
	chatConfig: Pick<AIChatConfig, "accountId">
	codex: AICodexModelOptions
}) {
	const headers: Record<string, string> = {
		originator: "mdit",
		"User-Agent": "mdit",
		"session-id": codex.sessionId ?? codex.createSessionId(),
		...(codex.headers ?? {}),
	}

	if (chatConfig.accountId) {
		headers["ChatGPT-Account-Id"] = chatConfig.accountId
	}

	return headers
}
