import type { ApiKeyProviderId } from "@mdit/ai"
import { Button } from "@mdit/ui/components/button"
import { Input } from "@mdit/ui/components/input"
import { useRef } from "react"

interface AIConnectProviderFieldProps {
	provider: ApiKeyProviderId
	isConnected: boolean
	isBusy: boolean
	onConnect: (provider: ApiKeyProviderId, apiKey: string) => Promise<void>
	onDisconnect: (provider: ApiKeyProviderId) => Promise<void>
}

export function AIConnectProviderField({
	provider,
	isConnected,
	isBusy,
	onConnect,
	onDisconnect,
}: AIConnectProviderFieldProps) {
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
